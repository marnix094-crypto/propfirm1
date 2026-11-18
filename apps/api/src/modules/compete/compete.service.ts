import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  applyFill,
  canStart,
  competeFloorMinor,
  isDrawdownBreached,
  marketExecution,
  prizeBreakdown,
  rankStandings,
  roundStartMs,
  settleRound,
  fromDecimalString,
  validateOrder,
  type Quote,
  type Side,
} from '@brand/engine';
import { Errors } from '../../common/errors.js';
import { PrismaService, type Tx } from '../../infra/prisma.service.js';
import type { CompeteEntry, CompeteOperator, CompeteRound } from '../../generated/prisma/client.js';
import { MarketDataService } from '../market-data/market-data.service.js';
import { CompeteAuditService } from './compete-audit.service.js';
import { CompeteEvents } from './events.js';
import { COMPETE_PAYMENTS, type CompetePaymentProvider } from './payments.js';
import { CompeteOperatorsService, paramsOf } from './operators.service.js';
import {
  entryMetrics,
  toEntryDto,
  toOrderDto,
  toRoundDto,
  type PositionWithSpec,
} from './mappers.js';
import type {
  CompeteEntryDto,
  CompeteHistoryItemDto,
  CompeteJoinResponseDto,
  CompeteLeaderboardDto,
  CompeteLeaderboardRowDto,
  CompeteOrderDto,
  CompeteRoundDto,
  PlaceCompeteOrderDto,
} from './dto.js';

type CloseReason = 'PLAYER' | 'DRAWDOWN' | 'ROUND_END';
const DAY_MS = 86_400_000;
const LEADERBOARD_ROWS = 100;

/**
 * The compete product's domain service: daily rounds (open → live → settled/cancelled),
 * paid entries (max. one per player per round), market-order trading on a virtual balance,
 * the static drawdown floor and settlement. All money math lives in @brand/engine.
 */
@Injectable()
export class CompeteService {
  private readonly logger = new Logger(CompeteService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly md: MarketDataService,
    private readonly audit: CompeteAuditService,
    private readonly operators: CompeteOperatorsService,
    private readonly events: CompeteEvents,
    @Inject(COMPETE_PAYMENTS) private readonly payments: CompetePaymentProvider,
  ) {}

  // ================================================================ rounds

  /** Makes sure every active operator has its next round (today's if still ahead, else tomorrow's). */
  async ensureRounds(now = Date.now()): Promise<void> {
    for (const op of await this.operators.active()) {
      const open = await this.prisma.competeRound.findFirst({
        where: { operatorId: op.id, status: { in: ['OPEN', 'LIVE'] } },
        select: { id: true },
      });
      if (open) continue;
      let startsAt = roundStartMs(now, op.timeZone, op.startMinuteOfDay);
      if (startsAt <= now) startsAt = roundStartMs(now + DAY_MS, op.timeZone, op.startMinuteOfDay);
      await this.createRound(op, new Date(startsAt));
    }
  }

  /** Creates a round with the operator's current parameters (snapshotted, D100). */
  async createRound(op: CompeteOperator, startsAt: Date, overrides: Partial<CompeteRound> = {}) {
    this.operators.assertValid(op);
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.competeRound.findUnique({
        where: { operatorId_startsAt: { operatorId: op.id, startsAt } },
      });
      if (existing) return existing;
      const round = await tx.competeRound.create({
        data: {
          operatorId: op.id,
          startsAt,
          endsAt: new Date(startsAt.getTime() + op.durationMinutes * 60_000),
          entryFeeMinor: op.entryFeeMinor,
          currency: op.currency,
          startBalanceMinor: op.startBalanceMinor,
          leverage: op.leverage,
          maxDrawdownBps: op.maxDrawdownBps,
          minParticipants: op.minParticipants,
          prizePoolBps: op.prizePoolBps,
          prizeSplitBps: op.prizeSplitBps,
          ...overrides,
        },
      });
      await this.audit.append(tx, {
        actorType: 'SYSTEM',
        operatorId: op.id,
        action: 'compete.round.created',
        entityType: 'CompeteRound',
        entityId: round.id,
        data: { startsAt: round.startsAt.toISOString(), endsAt: round.endsAt.toISOString() },
      });
      return round;
    });
  }

  private async paidCount(roundId: string, tx: Tx | PrismaService = this.prisma) {
    return tx.competeEntry.count({ where: { roundId, paidAt: { not: null } } });
  }

  private async roundDto(
    r: CompeteRound,
    myEntry: CompeteEntryDto | null,
  ): Promise<CompeteRoundDto> {
    const participants = r.status === 'CANCELLED' ? 0 : await this.paidCount(r.id);
    const b = prizeBreakdown(paramsOf(r), participants);
    return {
      ...toRoundDto(r, participants, r.potMinor ?? b.potMinor, b.prizesMinor),
      myEntry,
    };
  }

  /** The operator's next or running round, with the player's entry if any. */
  async currentRound(operatorId: string, playerId?: string): Promise<CompeteRoundDto> {
    let round = await this.prisma.competeRound.findFirst({
      where: { operatorId, status: { in: ['OPEN', 'LIVE'] } },
      orderBy: { startsAt: 'asc' },
    });
    if (!round) {
      await this.ensureRounds();
      round = await this.prisma.competeRound.findFirst({
        where: { operatorId, status: { in: ['OPEN', 'LIVE'] } },
        orderBy: { startsAt: 'asc' },
      });
    }
    if (!round) throw Errors.notFound('Round');
    const entry = playerId
      ? await this.prisma.competeEntry.findUnique({
          where: { roundId_playerId: { roundId: round.id, playerId } },
        })
      : null;
    return this.roundDto(round, entry ? await this.entryDto(entry, round) : null);
  }

  private async roundOfOperator(roundId: string, operatorId: string): Promise<CompeteRound> {
    const r = await this.prisma.competeRound.findUnique({ where: { id: roundId } });
    if (!r || r.operatorId !== operatorId) throw Errors.notFound('Round');
    return r;
  }

  async round(roundId: string, operatorId: string, playerId?: string): Promise<CompeteRoundDto> {
    const r = await this.roundOfOperator(roundId, operatorId);
    const entry = playerId
      ? await this.prisma.competeEntry.findUnique({
          where: { roundId_playerId: { roundId, playerId } },
        })
      : null;
    return this.roundDto(r, entry ? await this.entryDto(entry, r) : null);
  }

  /** Recent finished rounds of the operator (results page). */
  async recentRounds(operatorId: string, limit = 10): Promise<Omit<CompeteRoundDto, 'myEntry'>[]> {
    const rows = await this.prisma.competeRound.findMany({
      where: { operatorId, status: { in: ['SETTLED', 'CANCELLED'] } },
      orderBy: { startsAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 50),
    });
    return Promise.all(
      rows.map(async (r) => {
        const { myEntry: _m, ...rest } = await this.roundDto(r, null);
        return rest;
      }),
    );
  }

  // ================================================================ entries

  private positionsWithSpec(
    rows: {
      instrumentId: string;
      side: 'LONG' | 'SHORT';
      qty: bigint;
      avgEntryPrice: bigint;
      leverage: number;
      id: string;
      entryId: string;
      updatedAt: Date;
    }[],
  ): PositionWithSpec[] {
    return rows.map((row) => {
      const spec = this.md.instrumentById(row.instrumentId);
      return { row, spec, quote: this.md.peekQuote(spec.symbol) };
    });
  }

  private async entryDto(e: CompeteEntry, round: CompeteRound): Promise<CompeteEntryDto> {
    const rows = await this.prisma.competePosition.findMany({ where: { entryId: e.id } });
    return toEntryDto(e, round, this.positionsWithSpec(rows));
  }

  private async ownEntry(entryId: string, playerId: string) {
    const e = await this.prisma.competeEntry.findUnique({
      where: { id: entryId },
      include: { round: true },
    });
    if (!e || e.playerId !== playerId) throw Errors.notFound('Entry');
    return e;
  }

  async entry(entryId: string, playerId: string): Promise<CompeteEntryDto> {
    const e = await this.ownEntry(entryId, playerId);
    return this.entryDto(e, e.round);
  }

  async orders(entryId: string, playerId: string): Promise<CompeteOrderDto[]> {
    await this.ownEntry(entryId, playerId);
    const rows = await this.prisma.competeOrder.findMany({
      where: { entryId },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return rows.map((o) => toOrderDto(o, this.md.instrumentById(o.instrumentId)));
  }

  async history(playerId: string): Promise<CompeteHistoryItemDto[]> {
    const rows = await this.prisma.competeEntry.findMany({
      where: { playerId, paidAt: { not: null } },
      include: { round: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return Promise.all(
      rows.map(async (e) => {
        const { myEntry: _m, ...round } = await this.roundDto(e.round, null);
        return { round, entry: await this.entryDto(e, e.round) };
      }),
    );
  }

  /**
   * Join a round: one entry per player per round (D99). Creates (or retries) the entry fee
   * payment; the entry becomes ACTIVE once the payment succeeds.
   */
  async join(
    roundId: string,
    player: { id: string; operatorId: string; locale: string; country: string },
    now = Date.now(),
  ): Promise<CompeteJoinResponseDto> {
    const round = await this.roundOfOperator(roundId, player.operatorId);
    if (round.status !== 'OPEN' || round.startsAt.getTime() <= now)
      throw Errors.unprocessable('ROUND_CLOSED', 'Registration for this round has closed');

    const { entry, payment } = await this.prisma.$transaction(async (tx) => {
      let entry = await tx.competeEntry.findUnique({
        where: { roundId_playerId: { roundId, playerId: player.id } },
      });
      if (entry && entry.status !== 'PENDING_PAYMENT' && entry.status !== 'PAYMENT_FAILED')
        throw Errors.conflict('ALREADY_ENTERED', 'You already joined this round');
      if (!entry) {
        entry = await tx.competeEntry.create({
          data: { roundId, playerId: player.id, balanceMinor: round.startBalanceMinor },
        });
        await this.audit.append(tx, {
          actorType: 'USER',
          actorId: player.id,
          operatorId: player.operatorId,
          action: 'compete.entry.created',
          entityType: 'CompeteEntry',
          entityId: entry.id,
          data: { roundId, feeMinor: round.entryFeeMinor },
        });
      } else if (entry.status === 'PAYMENT_FAILED') {
        entry = await tx.competeEntry.update({
          where: { id: entry.id },
          data: { status: 'PENDING_PAYMENT' },
        });
      }
      const created = await this.payments.createEntryPayment({
        entryId: entry.id,
        amountMinor: round.entryFeeMinor,
        currency: round.currency,
        locale: player.locale,
      });
      const payment = await tx.competePayment.create({
        data: {
          entryId: entry.id,
          kind: 'ENTRY',
          amountMinor: round.entryFeeMinor,
          currency: round.currency,
          provider: this.payments.name,
          providerRef: created.providerRef,
        },
      });
      return { entry, payment: { ...payment, paymentUrl: created.paymentUrl } };
    });
    return { entry: await this.entryDto(entry, round), paymentUrl: payment.paymentUrl };
  }

  /**
   * Outcome of the fake provider's test page (a real PSP reports via a signed webhook later).
   * A payment that lands after registration closed is refunded at once.
   */
  async testPayment(
    entryId: string,
    playerId: string,
    outcome: 'succeeded' | 'failed',
    now = Date.now(),
  ): Promise<CompeteEntryDto> {
    if (!this.payments.isTest) throw Errors.forbidden('TEST_PAYMENTS_DISABLED');
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "CompeteEntry" WHERE id = ${entryId}::uuid FOR UPDATE`;
      const e = await tx.competeEntry.findUnique({
        where: { id: entryId },
        include: { round: true, player: { select: { operatorId: true } } },
      });
      if (!e || e.playerId !== playerId) throw Errors.notFound('Entry');
      if (e.status !== 'PENDING_PAYMENT')
        throw Errors.conflict('PAYMENT_NOT_PENDING', 'This entry has no open payment');
      const payment = await tx.competePayment.findFirst({
        where: { entryId, kind: 'ENTRY', status: 'PENDING' },
        orderBy: { createdAt: 'desc' },
      });
      if (!payment) throw Errors.conflict('PAYMENT_NOT_PENDING');
      const ok = outcome === 'succeeded';
      await tx.competePayment.update({
        where: { id: payment.id },
        data: { status: ok ? 'SUCCEEDED' : 'FAILED' },
      });
      const base = {
        actorType: 'USER' as const,
        actorId: playerId,
        operatorId: e.player.operatorId,
        entityType: 'CompeteEntry',
        entityId: e.id,
      };
      if (!ok) {
        const updated = await tx.competeEntry.update({
          where: { id: e.id },
          data: { status: 'PAYMENT_FAILED' },
        });
        await this.audit.append(tx, { ...base, action: 'compete.entry.payment_failed', data: {} });
        return { entry: updated, round: e.round };
      }
      const late = e.round.status !== 'OPEN' || e.round.startsAt.getTime() <= now;
      let updated = await tx.competeEntry.update({
        where: { id: e.id },
        data: { status: 'ACTIVE', paidAt: new Date(now) },
      });
      await this.audit.append(tx, {
        ...base,
        action: 'compete.entry.paid',
        data: { amountMinor: payment.amountMinor, paymentId: payment.id },
      });
      if (late) {
        updated = await this.refundTx(tx, updated, e.player.operatorId, 'LATE_PAYMENT');
      }
      return { entry: updated, round: e.round };
    });
    this.events.emit({
      type: 'entry.update',
      entryId,
      roundId: result.round.id,
      reason: 'payment',
    });
    return this.entryDto(result.entry, result.round);
  }

  private async refundTx(
    tx: Tx,
    e: CompeteEntry,
    operatorId: string,
    reason: 'MIN_PARTICIPANTS' | 'LATE_PAYMENT',
  ): Promise<CompeteEntry> {
    const paid = await tx.competePayment.findFirst({
      where: { entryId: e.id, kind: 'ENTRY', status: 'SUCCEEDED' },
      orderBy: { createdAt: 'desc' },
    });
    if (!paid) throw new Error(`Entry ${e.id} has no collected fee to refund`);
    const r = await this.payments.refund({
      providerRef: paid.providerRef ?? paid.id,
      amountMinor: paid.amountMinor,
    });
    await tx.competePayment.create({
      data: {
        entryId: e.id,
        kind: 'REFUND',
        status: 'SUCCEEDED',
        amountMinor: paid.amountMinor,
        currency: paid.currency,
        provider: this.payments.name,
        providerRef: r.providerRef,
      },
    });
    await this.audit.append(tx, {
      actorType: 'SYSTEM',
      operatorId,
      action: 'compete.entry.refunded',
      entityType: 'CompeteEntry',
      entityId: e.id,
      data: { amountMinor: paid.amountMinor, reason },
    });
    return tx.competeEntry.update({
      where: { id: e.id },
      data: { status: 'REFUNDED', endedAt: new Date() },
    });
  }

  // ================================================================ trading

  /** Runs `fn` with the entry row locked (single writer per entry). */
  private withEntry<T>(
    entryId: string,
    fn: (
      tx: Tx,
      e: CompeteEntry & { round: CompeteRound; player: { operatorId: string } },
    ) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "CompeteEntry" WHERE id = ${entryId}::uuid FOR UPDATE`;
        const e = await tx.competeEntry.findUnique({
          where: { id: entryId },
          include: { round: true, player: { select: { operatorId: true } } },
        });
        if (!e) throw Errors.notFound('Entry');
        return fn(tx, e);
      },
      { timeout: 15_000 },
    );
  }

  private async fillTx(
    tx: Tx,
    e: CompeteEntry & { round: CompeteRound; player: { operatorId: string } },
    args: { symbol: string; side: Side; qty: bigint; clientOrderId: string; reason: CloseReason },
    actor: { type: 'USER' | 'SYSTEM'; id: string | null },
  ) {
    const spec = this.md.instrumentBySymbol(args.symbol);
    const quote = this.md.freshQuote(spec.symbol);
    const leverage = Math.min(e.round.leverage, spec.maxLeverage);
    const current = await tx.competePosition.findUnique({
      where: { entryId_instrumentId: { entryId: e.id, instrumentId: spec.id } },
    });
    const all = await tx.competePosition.findMany({ where: { entryId: e.id } });
    const marked = this.positionsWithSpec(all);
    if (args.reason === 'PLAYER') {
      validateOrder(
        { side: args.side, type: 'MARKET', qty: args.qty, leverage },
        {
          spec,
          quote,
          position: current
            ? {
                side: current.side,
                qty: current.qty,
                avgEntryPrice: current.avgEntryPrice,
                leverage: current.leverage,
              }
            : null,
          metrics: entryMetrics(e.balanceMinor, marked),
          accountMaxLeverage: leverage,
        },
      );
    }
    const exec = marketExecution(args.side, args.qty, quote, spec);
    const result = applyFill(
      current
        ? {
            side: current.side,
            qty: current.qty,
            avgEntryPrice: current.avgEntryPrice,
            leverage: current.leverage,
          }
        : null,
      { side: args.side, qty: args.qty, price: exec.price, leverage },
      spec,
    );
    const balanceMinor = e.balanceMinor + result.realizedPnlMinor - exec.commissionMinor;
    if (result.position) {
      await tx.competePosition.upsert({
        where: { entryId_instrumentId: { entryId: e.id, instrumentId: spec.id } },
        create: {
          entryId: e.id,
          instrumentId: spec.id,
          side: result.position.side,
          qty: result.position.qty,
          avgEntryPrice: result.position.avgEntryPrice,
          leverage: result.position.leverage,
        },
        update: {
          side: result.position.side,
          qty: result.position.qty,
          avgEntryPrice: result.position.avgEntryPrice,
          leverage: result.position.leverage,
        },
      });
    } else if (current) {
      await tx.competePosition.delete({ where: { id: current.id } });
    }
    const order = await tx.competeOrder.create({
      data: {
        entryId: e.id,
        clientOrderId: args.clientOrderId,
        instrumentId: spec.id,
        side: args.side,
        qty: args.qty,
        price: exec.price,
        feeMinor: exec.commissionMinor,
        realizedPnlMinor: result.realizedPnlMinor,
        reason: args.reason,
      },
    });
    e.balanceMinor = balanceMinor;
    await tx.competeEntry.update({ where: { id: e.id }, data: { balanceMinor } });
    await this.audit.append(tx, {
      actorType: actor.type,
      actorId: actor.id,
      operatorId: e.player.operatorId,
      action: 'compete.order.filled',
      entityType: 'CompeteOrder',
      entityId: order.id,
      data: {
        entryId: e.id,
        symbol: spec.symbol,
        side: args.side,
        qty: args.qty,
        price: exec.price,
        feeMinor: exec.commissionMinor,
        realizedPnlMinor: result.realizedPnlMinor,
        reason: args.reason,
      },
    });
    return { order, spec };
  }

  private assertTradable(e: CompeteEntry & { round: CompeteRound }, now: number) {
    if (e.status !== 'ACTIVE')
      throw Errors.unprocessable('ENTRY_NOT_ACTIVE', 'This entry cannot trade');
    if (
      e.round.status !== 'LIVE' ||
      e.round.startsAt.getTime() > now ||
      e.round.endsAt.getTime() <= now
    )
      throw Errors.unprocessable('ROUND_NOT_LIVE', 'The round is not running');
  }

  /** Market order; idempotent per (entry, clientOrderId). */
  async placeOrder(
    entryId: string,
    playerId: string,
    dto: PlaceCompeteOrderDto,
    now = Date.now(),
  ): Promise<CompeteOrderDto> {
    const r = await this.withEntry(entryId, async (tx, e) => {
      if (e.playerId !== playerId) throw Errors.notFound('Entry');
      const dup = await tx.competeOrder.findUnique({
        where: { entryId_clientOrderId: { entryId, clientOrderId: dto.clientOrderId } },
      });
      if (dup)
        return { order: dup, spec: this.md.instrumentById(dup.instrumentId), roundId: e.roundId };
      this.assertTradable(e, now);
      const spec = this.md.instrumentBySymbol(dto.symbol);
      let qty: bigint;
      try {
        qty = fromDecimalString(dto.qty, spec.qtyDecimals);
      } catch {
        throw Errors.unprocessable('INVALID_QTY', 'Quantity has too many decimals');
      }
      const filled = await this.fillTx(
        tx,
        e,
        {
          symbol: spec.symbol,
          side: dto.side,
          qty,
          clientOrderId: dto.clientOrderId,
          reason: 'PLAYER',
        },
        { type: 'USER', id: playerId },
      );
      await this.checkDrawdownTx(tx, e);
      return { ...filled, roundId: e.roundId };
    });
    this.events.emit({ type: 'entry.update', entryId, roundId: r.roundId, reason: 'order' });
    return toOrderDto(r.order, r.spec);
  }

  /** Closes the player's position in one symbol at market. */
  async closePosition(
    entryId: string,
    playerId: string,
    symbol: string,
    clientOrderId: string,
    now = Date.now(),
  ): Promise<CompeteOrderDto> {
    const spec = this.md.instrumentBySymbol(symbol);
    const r = await this.withEntry(entryId, async (tx, e) => {
      if (e.playerId !== playerId) throw Errors.notFound('Entry');
      const dup = await tx.competeOrder.findUnique({
        where: { entryId_clientOrderId: { entryId, clientOrderId } },
      });
      if (dup) return { order: dup, spec, roundId: e.roundId };
      this.assertTradable(e, now);
      const pos = await tx.competePosition.findUnique({
        where: { entryId_instrumentId: { entryId, instrumentId: spec.id } },
      });
      if (!pos) throw Errors.notFound('Position');
      const filled = await this.fillTx(
        tx,
        e,
        {
          symbol,
          side: pos.side === 'LONG' ? 'SELL' : 'BUY',
          qty: pos.qty,
          clientOrderId,
          reason: 'PLAYER',
        },
        { type: 'USER', id: playerId },
      );
      return { ...filled, roundId: e.roundId };
    });
    this.events.emit({ type: 'entry.update', entryId, roundId: r.roundId, reason: 'order' });
    return toOrderDto(r.order, r.spec);
  }

  /** Force-closes every position at market (drawdown or round end). */
  private async closeAllTx(
    tx: Tx,
    e: CompeteEntry & { round: CompeteRound; player: { operatorId: string } },
    reason: Exclude<CloseReason, 'PLAYER'>,
  ) {
    const positions = await tx.competePosition.findMany({ where: { entryId: e.id } });
    for (const p of positions) {
      const spec = this.md.instrumentById(p.instrumentId);
      await this.fillTx(
        tx,
        e,
        {
          symbol: spec.symbol,
          side: p.side === 'LONG' ? 'SELL' : 'BUY',
          qty: p.qty,
          clientOrderId: `${reason.toLowerCase()}-${p.id}`,
          reason,
        },
        { type: 'SYSTEM', id: null },
      );
    }
  }

  /** Ends the entry when equity is at or below the static floor (D100). Returns true when breached. */
  private async checkDrawdownTx(
    tx: Tx,
    e: CompeteEntry & { round: CompeteRound; player: { operatorId: string } },
  ): Promise<boolean> {
    if (e.status !== 'ACTIVE') return false;
    const rows = await tx.competePosition.findMany({ where: { entryId: e.id } });
    const equity = entryMetrics(e.balanceMinor, this.positionsWithSpec(rows)).equityMinor;
    const floor = competeFloorMinor(e.round);
    if (!isDrawdownBreached(equity, floor)) return false;
    await this.closeAllTx(tx, e, 'DRAWDOWN');
    await tx.competeEntry.update({
      where: { id: e.id },
      data: { status: 'BREACHED', finalEquityMinor: e.balanceMinor, endedAt: new Date() },
    });
    e.status = 'BREACHED';
    await this.audit.append(tx, {
      actorType: 'SYSTEM',
      operatorId: e.player.operatorId,
      action: 'compete.entry.breached',
      entityType: 'CompeteEntry',
      entityId: e.id,
      data: { equityMinor: equity, floorMinor: floor, finalEquityMinor: e.balanceMinor },
    });
    return true;
  }

  /** Drawdown sweep over all active entries with open positions in live rounds. */
  async sweepDrawdown(): Promise<number> {
    const candidates = await this.prisma.competeEntry.findMany({
      where: { status: 'ACTIVE', round: { status: 'LIVE' }, positions: { some: {} } },
      select: { id: true },
    });
    let breached = 0;
    for (const { id } of candidates) {
      try {
        const hit = await this.withEntry(id, async (tx, e) =>
          (await this.checkDrawdownTx(tx, e)) ? e.roundId : null,
        );
        if (hit) {
          breached++;
          this.events.emit({ type: 'entry.update', entryId: id, roundId: hit, reason: 'breached' });
        }
      } catch (err) {
        this.logger.warn(`Drawdown check ${id} failed: ${(err as Error).message}`);
      }
    }
    return breached;
  }

  // ================================================================ lifecycle

  /** OPEN → LIVE (or CANCELLED + refunds) at the start time. */
  async startDue(now = Date.now()): Promise<void> {
    const due = await this.prisma.competeRound.findMany({
      where: { status: 'OPEN', startsAt: { lte: new Date(now) } },
    });
    for (const round of due) {
      const status = await this.prisma.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT id FROM "CompeteRound" WHERE id = ${round.id}::uuid FOR UPDATE`;
          const r = await tx.competeRound.findUnique({ where: { id: round.id } });
          if (!r || r.status !== 'OPEN') return null;
          // Unpaid entries expire when the round starts.
          await tx.competeEntry.updateMany({
            where: { roundId: r.id, status: 'PENDING_PAYMENT' },
            data: { status: 'PAYMENT_FAILED' },
          });
          await tx.competePayment.updateMany({
            where: { entry: { roundId: r.id }, kind: 'ENTRY', status: 'PENDING' },
            data: { status: 'FAILED' },
          });
          const paid = await tx.competeEntry.findMany({
            where: { roundId: r.id, status: 'ACTIVE' },
          });
          if (canStart(paramsOf(r), paid.length)) {
            await tx.competeRound.update({
              where: { id: r.id },
              data: { status: 'LIVE', startedAt: new Date(now) },
            });
            await this.audit.append(tx, {
              actorType: 'SYSTEM',
              operatorId: r.operatorId,
              action: 'compete.round.started',
              entityType: 'CompeteRound',
              entityId: r.id,
              data: { participants: paid.length },
            });
            return { operatorId: r.operatorId, status: 'LIVE' as const };
          }
          for (const e of paid) await this.refundTx(tx, e, r.operatorId, 'MIN_PARTICIPANTS');
          await tx.competeRound.update({
            where: { id: r.id },
            data: {
              status: 'CANCELLED',
              potMinor: 0n,
              operatorShareMinor: 0n,
              settledAt: new Date(now),
            },
          });
          await this.audit.append(tx, {
            actorType: 'SYSTEM',
            operatorId: r.operatorId,
            action: 'compete.round.cancelled',
            entityType: 'CompeteRound',
            entityId: r.id,
            data: { participants: paid.length, minParticipants: r.minParticipants },
          });
          return { operatorId: r.operatorId, status: 'CANCELLED' as const };
        },
        { timeout: 60_000 },
      );
      if (status) this.events.emit({ type: 'round.update', roundId: round.id, ...status });
    }
  }

  /** LIVE → SETTLED at the end time: close everything at market, rank, assign prizes. */
  async settleDue(now = Date.now()): Promise<void> {
    const due = await this.prisma.competeRound.findMany({
      where: { status: 'LIVE', endsAt: { lte: new Date(now) } },
    });
    for (const round of due) {
      try {
        await this.settle(round.id, now);
      } catch (err) {
        // Typically a stale quote: retried on the next tick.
        this.logger.warn(`Settling round ${round.id} postponed: ${(err as Error).message}`);
      }
    }
  }

  private async settle(roundId: string, now: number): Promise<void> {
    // 1) Close every active entry (each in its own locked transaction).
    const active = await this.prisma.competeEntry.findMany({
      where: { roundId, status: 'ACTIVE' },
      select: { id: true },
    });
    for (const { id } of active) {
      await this.withEntry(id, async (tx, e) => {
        if (e.status !== 'ACTIVE') return;
        await this.closeAllTx(tx, e, 'ROUND_END');
        await tx.competeEntry.update({
          where: { id: e.id },
          data: { status: 'FINISHED', finalEquityMinor: e.balanceMinor, endedAt: new Date(now) },
        });
      });
    }
    // 2) Rank and pay out.
    const op = await this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "CompeteRound" WHERE id = ${roundId}::uuid FOR UPDATE`;
        const r = await tx.competeRound.findUnique({ where: { id: roundId } });
        if (!r || r.status !== 'LIVE') return null;
        const entries = await tx.competeEntry.findMany({
          where: { roundId, status: { in: ['FINISHED', 'BREACHED'] } },
        });
        const outcome = settleRound(
          paramsOf(r),
          entries.map((e) => ({
            entryId: e.id,
            equityMinor: e.finalEquityMinor ?? e.balanceMinor,
            startBalanceMinor: r.startBalanceMinor,
            enteredAtMs: (e.paidAt ?? e.createdAt).getTime(),
          })),
        );
        if (outcome.status !== 'SETTLED') throw new Error('A live round always settles');
        for (const row of outcome.ranking) {
          await tx.competeEntry.update({
            where: { id: row.entryId },
            data: { rank: row.rank, prizeMinor: row.prizeMinor },
          });
          if (row.prizeMinor > 0n) {
            await tx.competePayment.create({
              data: {
                entryId: row.entryId,
                kind: 'PRIZE',
                status: 'AWAITING_PAYOUT',
                amountMinor: row.prizeMinor,
                currency: r.currency,
                provider: this.payments.name,
              },
            });
          }
        }
        await tx.competeRound.update({
          where: { id: r.id },
          data: {
            status: 'SETTLED',
            potMinor: outcome.breakdown.potMinor,
            operatorShareMinor: outcome.breakdown.operatorMinor,
            settledAt: new Date(now),
          },
        });
        await this.audit.append(tx, {
          actorType: 'SYSTEM',
          operatorId: r.operatorId,
          action: 'compete.round.settled',
          entityType: 'CompeteRound',
          entityId: r.id,
          data: {
            participants: entries.length,
            potMinor: outcome.breakdown.potMinor,
            operatorShareMinor: outcome.breakdown.operatorMinor,
            winners: outcome.ranking
              .filter((x) => x.prizeMinor > 0n)
              .map((x) => ({ entryId: x.entryId, rank: x.rank, prizeMinor: x.prizeMinor })),
          },
        });
        return r.operatorId;
      },
      { timeout: 60_000 },
    );
    if (op) this.events.emit({ type: 'round.update', operatorId: op, roundId, status: 'SETTLED' });
  }

  /** One scheduler tick: start/settle due rounds, then make sure the next round exists. */
  async tick(now = Date.now()): Promise<void> {
    await this.startDue(now);
    await this.settleDue(now);
    await this.ensureRounds(now);
  }

  // ================================================================ leaderboard

  async leaderboard(
    roundId: string,
    operatorId: string,
    playerId?: string,
  ): Promise<CompeteLeaderboardDto> {
    const r = await this.roundOfOperator(roundId, operatorId);
    const entries = await this.prisma.competeEntry.findMany({
      where: {
        roundId,
        status: { in: ['ACTIVE', 'BREACHED', 'FINISHED'] },
      },
      include: { player: { select: { nickname: true } }, positions: true },
    });
    const quoteCache = new Map<string, Quote | null>();
    const withQuotes = (rows: (typeof entries)[number]['positions']) =>
      rows.map((row) => {
        const spec = this.md.instrumentById(row.instrumentId);
        if (!quoteCache.has(spec.symbol))
          quoteCache.set(spec.symbol, this.md.peekQuote(spec.symbol));
        return { row, spec, quote: quoteCache.get(spec.symbol) ?? null };
      });
    const equityOf = (e: (typeof entries)[number]) =>
      e.status === 'ACTIVE'
        ? entryMetrics(e.balanceMinor, withQuotes(e.positions)).equityMinor
        : (e.finalEquityMinor ?? e.balanceMinor);
    const ranked = rankStandings(
      entries.map((e) => ({
        entryId: e.id,
        equityMinor: equityOf(e),
        startBalanceMinor: r.startBalanceMinor,
        enteredAtMs: (e.paidAt ?? e.createdAt).getTime(),
      })),
    );
    const byId = new Map(entries.map((e) => [e.id, e]));
    const b = prizeBreakdown(paramsOf(r), entries.length);
    const rows: CompeteLeaderboardRowDto[] = ranked.map((x) => {
      const e = byId.get(x.entryId)!;
      return {
        rank: x.rank,
        nickname: e.player.nickname,
        returnBps: x.returnBps.toString(),
        equityMinor: x.equityMinor.toString(),
        status: e.status,
        prizeMinor: (r.status === 'SETTLED'
          ? (e.prizeMinor ?? 0n)
          : (b.prizesMinor[x.rank - 1] ?? 0n)
        ).toString(),
        isMe: playerId !== undefined && e.playerId === playerId,
      };
    });
    return {
      roundId,
      status: r.status,
      participants: entries.length,
      potMinor: (r.potMinor ?? b.potMinor).toString(),
      asOf: new Date().toISOString(),
      rows: rows.slice(0, LEADERBOARD_ROWS),
      me: rows.find((x) => x.isMe) ?? null,
    };
  }
}
