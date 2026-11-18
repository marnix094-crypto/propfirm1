import { createHash } from 'node:crypto';
import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import type { Subscription } from 'rxjs';
import {
  accountMetrics,
  applyFill,
  fromDecimalString,
  fundingPaymentMinor,
  isStopTriggered,
  limitExecution,
  marketExecution,
  TradingError,
  validateOrder,
  type ExecutionQuote,
  type MarkedPosition,
  type OrderRequest,
  type PositionState,
  type Quote,
} from '@brand/engine';
import { PrismaService, type Tx } from '../../infra/prisma.service.js';
import { canonicalJson } from '../../common/json.js';
import { AppError, Errors } from '../../common/errors.js';
import { AuditService } from '../audit/audit.service.js';
import { MarketDataService, type InstrumentRecord } from '../market-data/market-data.service.js';
import type {
  Order,
  OrderSource,
  Position,
  TradingAccount,
} from '../../generated/prisma/client.js';
import {
  AccountStateService,
  type BreachEvent,
  type RuleStatePatch,
} from './account-state.service.js';
import { tradingDateKey } from './day.js';
import { TradingEvents, type AccountEvent } from './events.js';
import { toFillDto, toOrderDto } from './mappers.js';
import type { OrderDto, PlaceOrderDto, UpdatePositionDto } from './dto.js';

interface Ctx {
  tx: Tx;
  account: TradingAccount;
  actorType: 'USER' | 'SYSTEM';
  actorId: string | null;
  events: Omit<AccountEvent, 'seq' | 'accountId' | 'userId'>[];
  /** Orders that became OPEN (to add to the matcher after commit). */
  opened: { order: Order; instrument: InstrumentRecord }[];
  /** Orders that left OPEN. */
  closed: string[];
}

const TRADABLE = ['ACTIVE', 'FUNDED_ACTIVE'] as const;
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

function parseQty(s: string, inst: InstrumentRecord): bigint {
  try {
    return fromDecimalString(s, inst.qtyDecimals);
  } catch {
    throw Errors.unprocessable(
      'QTY_PRECISION',
      `Quantity supports at most ${inst.qtyDecimals} decimals`,
    );
  }
}
function parsePrice(s: string | undefined | null, inst: InstrumentRecord): bigint | undefined {
  if (s === undefined || s === null) return undefined;
  try {
    return fromDecimalString(s, inst.priceDecimals);
  } catch {
    throw Errors.unprocessable(
      'PRICE_PRECISION',
      `Price supports at most ${inst.priceDecimals} decimals`,
    );
  }
}

/**
 * Order lifecycle for simulated accounts. Every mutation runs in one DB transaction with the
 * account row locked (single writer per account) and is audited. Events go out after commit.
 */
export interface OpenRuleAccountArgs {
  userId: string;
  ruleSetId: string;
  kind: 'CHALLENGE' | 'FUNDED';
  initialBalanceMinor: bigint;
  label: string;
  actor: { type: 'USER' | 'SYSTEM'; id: string | null };
  purchaseId?: string;
}

@Injectable()
export class TradingService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TradingService.name);
  private readonly queues = new Map<string, Promise<unknown>>();
  /** Open LIMIT/STOP orders by instrument, for the matcher. */
  private readonly openOrders = new Map<string, Map<string, Order>>();
  private readonly inFlight = new Set<string>();
  private readonly fundingSettled = new Map<string, number>();
  private subs: Subscription[] = [];

  constructor(
    private readonly prisma: PrismaService,
    private readonly md: MarketDataService,
    private readonly audit: AuditService,
    private readonly state: AccountStateService,
    private readonly events: TradingEvents,
  ) {}

  async onModuleInit() {
    const open = await this.prisma.order.findMany({ where: { status: 'OPEN' } });
    for (const o of open) this.indexOpen(o);
    this.subs.push(
      this.md.quotes$.subscribe(({ instrumentId, quote }) => this.onQuote(instrumentId, quote)),
      this.state.stopOut$.subscribe((accountId) =>
        this.guarded(`stopout:${accountId}`, () =>
          this.closeAll(null, accountId, 'SYSTEM_STOPOUT'),
        ),
      ),
      this.state.breach$.subscribe((b) =>
        this.guarded(`breach:${b.accountId}`, () => this.failAccount(b)),
      ),
      this.state.ruleState$.subscribe(
        (patch) =>
          void this.persistRuleState(patch).catch((e: Error) => this.logger.warn(e.message)),
      ),
    );
  }

  onModuleDestroy() {
    for (const s of this.subs) s.unsubscribe();
  }

  // ---------------------------------------------------------------- core plumbing

  /** Serialise work per account in-process; the DB row lock guarantees it across instances. */
  private exclusive<T>(accountId: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.queues.get(accountId) ?? Promise.resolve();
    const next = prev.catch(() => undefined).then(fn);
    this.queues.set(accountId, next);
    next
      .finally(() => {
        if (this.queues.get(accountId) === next) this.queues.delete(accountId);
      })
      .catch(() => undefined); // the caller handles the rejection of `next`
    return next;
  }

  private async withAccount<T>(
    accountId: string,
    userId: string | null,
    fn: (ctx: Ctx) => Promise<T>,
    opts: { allowInactive?: boolean } = {},
  ): Promise<T> {
    return this.exclusive(accountId, async () => {
      let ctx!: Ctx;
      const result = await this.prisma.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT id FROM "TradingAccount" WHERE id = ${accountId}::uuid FOR UPDATE`;
          const account = await tx.tradingAccount.findUnique({ where: { id: accountId } });
          if (!account || (userId !== null && account.userId !== userId))
            throw Errors.notFound('Account');
          if (
            !opts.allowInactive &&
            !TRADABLE.includes(account.status as (typeof TRADABLE)[number])
          ) {
            throw Errors.unprocessable('ACCOUNT_NOT_ACTIVE', 'This account cannot trade');
          }
          ctx = {
            tx,
            account,
            actorType: userId ? 'USER' : 'SYSTEM',
            actorId: userId,
            events: [],
            opened: [],
            closed: [],
          };
          const r = await fn(ctx);
          if (ctx.events.length > 0) {
            const seq = account.seq + BigInt(ctx.events.length);
            await tx.tradingAccount.update({ where: { id: accountId }, data: { seq } });
            ctx.account.seq = seq;
          }
          return r;
        },
        { timeout: 15_000 },
      );
      // After commit: matcher index, in-memory state, events.
      for (const id of ctx.closed) this.unindexOpen(id);
      for (const { order } of ctx.opened) this.indexOpen(order);
      const live = await this.state.reload(accountId);
      if (live?.rules) this.state.evaluateNow(accountId);
      let seq = ctx.account.seq - BigInt(ctx.events.length);
      for (const e of ctx.events) {
        seq += 1n;
        this.events.emit({ ...e, accountId, userId: ctx.account.userId, seq });
      }
      if (live && ctx.events.some((e) => e.type === 'fill' || e.type === 'position.update')) {
        this.events.emit({
          accountId,
          userId: live.userId,
          type: 'account.update',
          seq: 0n,
          payload: this.state.metricsPayload(live, this.state.metrics(live)),
        });
        void this.state.snapshot(accountId).catch(() => undefined);
      }
      return result;
    });
  }

  /** Run a system action at most once concurrently per key. */
  private guarded(key: string, fn: () => Promise<unknown>) {
    if (this.inFlight.has(key)) return;
    this.inFlight.add(key);
    fn()
      .catch((e: Error) => {
        if (!(e instanceof AppError) && !(e instanceof TradingError))
          this.logger.error(`${key}: ${e.message}`);
      })
      .finally(() => this.inFlight.delete(key));
  }

  private indexOpen(o: Order) {
    if (!this.openOrders.has(o.instrumentId)) this.openOrders.set(o.instrumentId, new Map());
    this.openOrders.get(o.instrumentId)!.set(o.id, o);
  }
  private unindexOpen(orderId: string) {
    for (const m of this.openOrders.values()) m.delete(orderId);
  }

  private async markedPositions(
    tx: Tx,
    accountId: string,
    override?: { instrumentId: string; quote: Quote },
  ) {
    const rows = await tx.position.findMany({ where: { accountId, status: 'OPEN' } });
    const marked: MarkedPosition[] = rows.map((p) => {
      const spec = this.md.instrumentById(p.instrumentId);
      const quote =
        override && override.instrumentId === p.instrumentId
          ? override.quote
          : (this.md.peekQuote(spec.symbol) ?? {
              bid: p.avgEntryPrice,
              ask: p.avgEntryPrice,
              ts: 0,
            });
      return {
        position: {
          side: p.side,
          qty: p.qty,
          avgEntryPrice: p.avgEntryPrice,
          leverage: p.leverage,
        },
        spec,
        quote,
      };
    });
    return { rows, marked };
  }

  private async auditOrder(
    ctx: Ctx,
    action: string,
    order: Order,
    data: Record<string, unknown> = {},
  ) {
    await this.audit.append(ctx.tx, {
      actorType: ctx.actorType,
      actorId: ctx.actorId,
      action,
      entityType: 'Order',
      entityId: order.id,
      data: {
        accountId: order.accountId,
        instrumentId: order.instrumentId,
        side: order.side,
        type: order.type,
        qty: order.qty,
        source: order.source,
        ...data,
      },
    });
  }

  // ---------------------------------------------------------------- place / cancel

  async placeOrder(
    userId: string,
    accountId: string,
    dto: PlaceOrderDto,
    idempotencyKey: string,
  ): Promise<OrderDto> {
    const requestHash = sha256(canonicalJson({ accountId, ...dto }));
    return this.withAccount(accountId, userId, async (ctx) => {
      const { tx, account } = ctx;
      const idem = await tx.idempotencyKey.findUnique({
        where: { userId_key: { userId, key: idempotencyKey } },
      });
      if (idem) {
        if (idem.requestHash !== requestHash)
          throw Errors.conflict(
            'IDEMPOTENCY_KEY_REUSED',
            'Idempotency-Key was used for a different request',
          );
        return idem.responseBody as unknown as OrderDto;
      }
      const inst = this.md.instrumentBySymbol(dto.symbol);
      const dup = await tx.order.findUnique({
        where: { accountId_clientOrderId: { accountId, clientOrderId: dto.clientOrderId } },
      });
      if (dup) return toOrderDto(dup, inst);

      const req: OrderRequest = {
        side: dto.side,
        type: dto.type,
        qty: parseQty(dto.qty, inst),
        limitPrice: dto.type === 'LIMIT' ? parsePrice(dto.limitPrice, inst) : undefined,
        stopPrice: dto.type === 'STOP' ? parsePrice(dto.stopPrice, inst) : undefined,
        leverage: dto.leverage,
        reduceOnly: dto.reduceOnly ?? false,
      };
      const quote = this.md.freshQuote(inst.symbol);
      const { rows, marked } = await this.markedPositions(tx, accountId, {
        instrumentId: inst.id,
        quote,
      });
      const current = rows.find((p) => p.instrumentId === inst.id) ?? null;
      validateOrder(req, {
        spec: inst,
        quote,
        position: current
          ? {
              side: current.side,
              qty: current.qty,
              avgEntryPrice: current.avgEntryPrice,
              leverage: current.leverage,
            }
          : null,
        metrics: accountMetrics(account.balanceMinor, marked),
        accountMaxLeverage: account.maxLeverage,
      });

      const slPrice = parsePrice(dto.slPrice, inst) ?? null;
      const tpPrice = parsePrice(dto.tpPrice, inst) ?? null;
      const ref = req.limitPrice ?? req.stopPrice ?? (req.side === 'BUY' ? quote.ask : quote.bid);
      const long = req.side === 'BUY';
      if (slPrice !== null && (long ? slPrice >= ref : slPrice <= ref))
        throw Errors.unprocessable('SL_INVALID', 'Stop loss is on the wrong side of the entry');
      if (tpPrice !== null && (long ? tpPrice <= ref : tpPrice >= ref))
        throw Errors.unprocessable('TP_INVALID', 'Take profit is on the wrong side of the entry');

      let order = await tx.order.create({
        data: {
          accountId,
          clientOrderId: dto.clientOrderId,
          instrumentId: inst.id,
          side: req.side,
          type: req.type,
          qty: req.qty,
          limitPrice: req.limitPrice ?? null,
          stopPrice: req.stopPrice ?? null,
          slPrice,
          tpPrice,
          leverage: req.leverage,
          reduceOnly: req.reduceOnly ?? false,
          status: 'PENDING',
        },
      });
      await this.auditOrder(ctx, 'order.placed', order, {
        limitPrice: order.limitPrice,
        stopPrice: order.stopPrice,
        leverage: order.leverage,
      });

      const exec =
        req.type === 'MARKET'
          ? marketExecution(req.side, req.qty, quote, inst)
          : req.type === 'LIMIT'
            ? limitExecution(req.side, req.qty, req.limitPrice!, quote, inst)
            : null;
      if (exec) {
        order = await this.fill(ctx, order, inst, exec);
      } else {
        order = await tx.order.update({ where: { id: order.id }, data: { status: 'OPEN' } });
        ctx.opened.push({ order, instrument: inst });
        ctx.events.push({ type: 'order.update', payload: toOrderDto(order, inst) });
      }

      const response = toOrderDto(order, inst);
      await tx.idempotencyKey.create({
        data: {
          key: idempotencyKey,
          userId,
          route: 'POST /accounts/:id/orders',
          requestHash,
          responseStatus: 201,
          responseBody: response as object,
          expiresAt: new Date(Date.now() + 24 * 3_600_000),
        },
      });
      return response;
    });
  }

  async cancelOrder(userId: string, accountId: string, orderId: string): Promise<OrderDto> {
    return this.withAccount(
      accountId,
      userId,
      async (ctx) => {
        const order = await ctx.tx.order.findFirst({ where: { id: orderId, accountId } });
        if (!order) throw Errors.notFound('Order');
        const inst = this.md.instrumentById(order.instrumentId);
        if (order.status !== 'OPEN')
          throw Errors.unprocessable('ORDER_NOT_OPEN', 'Only open orders can be cancelled');
        const updated = await ctx.tx.order.update({
          where: { id: order.id },
          data: { status: 'CANCELLED' },
        });
        await this.auditOrder(ctx, 'order.cancelled', updated);
        ctx.closed.push(order.id);
        ctx.events.push({ type: 'order.update', payload: toOrderDto(updated, inst) });
        return toOrderDto(updated, inst);
      },
      { allowInactive: true },
    );
  }

  // ---------------------------------------------------------------- fills

  /** Apply an execution to the account: position (netting), ledger, balance, fill, audit, events. */
  private async fill(
    ctx: Ctx,
    order: Order,
    inst: InstrumentRecord,
    exec: ExecutionQuote,
  ): Promise<Order> {
    const { tx, account } = ctx;
    const existing = await tx.position.findFirst({
      where: { accountId: account.id, instrumentId: inst.id, status: 'OPEN' },
    });
    const before: PositionState | null = existing
      ? {
          side: existing.side,
          qty: existing.qty,
          avgEntryPrice: existing.avgEntryPrice,
          leverage: existing.leverage,
        }
      : null;
    const result = applyFill(
      before,
      { side: order.side, qty: order.qty, price: exec.price, leverage: order.leverage },
      inst,
    );
    const now = new Date();

    let position: Position;
    const flipped = existing && result.position && result.position.side !== existing.side;
    if (existing && (result.position === null || flipped)) {
      await tx.position.update({
        where: { id: existing.id },
        data: {
          status: 'CLOSED',
          closedAt: now,
          realizedPnlMinor: existing.realizedPnlMinor + result.realizedPnlMinor,
        },
      });
      ctx.events.push({
        type: 'position.update',
        payload: { id: existing.id, symbol: inst.symbol, status: 'CLOSED' },
      });
    }
    if (result.position) {
      const sameDirection = (order.side === 'BUY') === (result.position.side === 'LONG');
      const sl =
        sameDirection && order.slPrice !== null
          ? order.slPrice
          : existing && !flipped
            ? existing.slPrice
            : null;
      const tp =
        sameDirection && order.tpPrice !== null
          ? order.tpPrice
          : existing && !flipped
            ? existing.tpPrice
            : null;
      if (existing && !flipped) {
        position = await tx.position.update({
          where: { id: existing.id },
          data: {
            qty: result.position.qty,
            avgEntryPrice: result.position.avgEntryPrice,
            realizedPnlMinor: existing.realizedPnlMinor + result.realizedPnlMinor,
            slPrice: sl,
            tpPrice: tp,
          },
        });
      } else {
        position = await tx.position.create({
          data: {
            accountId: account.id,
            instrumentId: inst.id,
            side: result.position.side,
            qty: result.position.qty,
            avgEntryPrice: result.position.avgEntryPrice,
            leverage: result.position.leverage,
            slPrice: sl,
            tpPrice: tp,
            lastFundingAt: now,
          },
        });
      }
      ctx.events.push({
        type: 'position.update',
        payload: { id: position.id, symbol: inst.symbol, status: 'OPEN' },
      });
    }

    // Ledger + balance.
    let balance = account.balanceMinor;
    const entries: { type: 'REALIZED_PNL' | 'COMMISSION'; amount: bigint }[] = [];
    if (result.realizedPnlMinor !== 0n)
      entries.push({ type: 'REALIZED_PNL', amount: result.realizedPnlMinor });
    if (exec.commissionMinor !== 0n)
      entries.push({ type: 'COMMISSION', amount: -exec.commissionMinor });
    for (const e of entries) {
      balance += e.amount;
      await tx.ledgerEntry.create({
        data: {
          accountId: account.id,
          type: e.type,
          amountMinor: e.amount,
          balanceAfterMinor: balance,
          refType: 'order',
          refId: order.id,
        },
      });
    }
    account.balanceMinor = balance;
    if (balance > account.highWaterMarkMinor) account.highWaterMarkMinor = balance;
    // Trading days: a day counts once it has at least one fill (Europe/Amsterdam).
    const today = tradingDateKey(now);
    if (account.lastTradingDate !== today) {
      account.lastTradingDate = today;
      account.tradingDaysCount += 1;
      account.cycleTradingDays += 1;
    }
    await tx.tradingAccount.update({
      where: { id: account.id },
      data: {
        balanceMinor: balance,
        highWaterMarkMinor: account.highWaterMarkMinor,
        lastTradingDate: account.lastTradingDate,
        tradingDaysCount: account.tradingDaysCount,
        cycleTradingDays: account.cycleTradingDays,
      },
    });

    const fill = await tx.fill.create({
      data: {
        orderId: order.id,
        accountId: account.id,
        instrumentId: inst.id,
        side: order.side,
        qty: order.qty,
        price: exec.price,
        referencePrice: exec.referencePrice,
        spreadCostMinor: exec.spreadCostMinor,
        slippageCostMinor: exec.slippageCostMinor,
        commissionMinor: exec.commissionMinor,
        realizedPnlMinor: result.realizedPnlMinor,
        executedAt: now,
      },
    });
    const filled = await tx.order.update({
      where: { id: order.id },
      data: { status: 'FILLED', filledQty: order.qty, avgFillPrice: exec.price },
    });
    await this.auditOrder(ctx, 'order.filled', filled, {
      price: exec.price,
      referencePrice: exec.referencePrice,
      commissionMinor: exec.commissionMinor,
      realizedPnlMinor: result.realizedPnlMinor,
      balanceAfterMinor: balance,
    });
    ctx.events.push({ type: 'order.update', payload: toOrderDto(filled, inst) });
    ctx.events.push({ type: 'fill', payload: toFillDto(fill, inst) });
    return filled;
  }

  // ---------------------------------------------------------------- matcher (ticks)

  private onQuote(instrumentId: string, quote: Quote) {
    const orders = this.openOrders.get(instrumentId);
    if (orders) {
      for (const o of orders.values()) {
        const hit =
          o.type === 'LIMIT'
            ? limitExecution(
                o.side,
                o.qty,
                o.limitPrice!,
                quote,
                this.md.instrumentById(instrumentId),
              ) !== null
            : isStopTriggered(o.side, o.stopPrice!, quote);
        if (hit) this.guarded(`order:${o.id}`, () => this.executePending(o.id, o.accountId));
      }
    }
    for (const { accountId, position } of this.state.positionsWithSlTp(instrumentId)) {
      const long = position.state.side === 'LONG';
      const px = long ? quote.bid : quote.ask;
      const sl =
        position.slPrice !== null && (long ? px <= position.slPrice : px >= position.slPrice);
      const tp =
        position.tpPrice !== null && (long ? px >= position.tpPrice : px <= position.tpPrice);
      if (sl || tp) {
        this.guarded(`pos:${position.id}`, () =>
          this.closePosition(
            null,
            accountId,
            position.id,
            undefined,
            sl ? 'SYSTEM_SL' : 'SYSTEM_TP',
          ),
        );
      }
    }
  }

  /** Execute a triggered LIMIT/STOP order if still executable; re-checks margin at fill time. */
  async executePending(orderId: string, accountId: string): Promise<void> {
    await this.withAccount(accountId, null, async (ctx) => {
      const order = await ctx.tx.order.findUnique({ where: { id: orderId } });
      if (!order || order.status !== 'OPEN') return;
      const inst = this.md.instrumentById(order.instrumentId);
      const quote = this.md.peekQuote(inst.symbol);
      if (!quote) return;
      const exec =
        order.type === 'LIMIT'
          ? limitExecution(order.side, order.qty, order.limitPrice!, quote, inst)
          : isStopTriggered(order.side, order.stopPrice!, quote)
            ? marketExecution(order.side, order.qty, quote, inst)
            : null;
      if (!exec) return;
      ctx.closed.push(order.id);
      const { rows, marked } = await this.markedPositions(ctx.tx, accountId, {
        instrumentId: inst.id,
        quote,
      });
      const current = rows.find((p) => p.instrumentId === inst.id) ?? null;
      try {
        validateOrder(
          {
            side: order.side,
            type: 'MARKET',
            qty: order.qty,
            leverage: order.leverage,
            reduceOnly: order.reduceOnly,
          },
          {
            spec: inst,
            quote,
            position: current
              ? {
                  side: current.side,
                  qty: current.qty,
                  avgEntryPrice: current.avgEntryPrice,
                  leverage: current.leverage,
                }
              : null,
            metrics: accountMetrics(ctx.account.balanceMinor, marked),
            accountMaxLeverage: ctx.account.maxLeverage,
          },
        );
      } catch (e) {
        if (!(e instanceof TradingError)) throw e;
        const rejected = await ctx.tx.order.update({
          where: { id: order.id },
          data: { status: 'REJECTED', rejectCode: e.code },
        });
        await this.auditOrder(ctx, 'order.rejected', rejected, { rejectCode: e.code });
        ctx.events.push({ type: 'order.update', payload: toOrderDto(rejected, inst) });
        return;
      }
      await this.fill(ctx, order, inst, exec);
    });
  }

  // ---------------------------------------------------------------- positions

  async closePosition(
    userId: string | null,
    accountId: string,
    positionId: string,
    qtyStr: string | undefined,
    source: OrderSource = 'USER',
  ): Promise<OrderDto | null> {
    return this.withAccount(
      accountId,
      userId,
      async (ctx) => {
        const pos = await ctx.tx.position.findFirst({ where: { id: positionId, accountId } });
        if (!pos || pos.status !== 'OPEN') {
          if (source !== 'USER') return null; // already closed by another path
          throw Errors.notFound('Position');
        }
        const inst = this.md.instrumentById(pos.instrumentId);
        const qty = qtyStr ? parseQty(qtyStr, inst) : pos.qty;
        if (qty <= 0n || qty > pos.qty || qty % inst.qtyStep !== 0n)
          throw Errors.unprocessable('INVALID_QTY', 'Invalid close quantity');
        const quote =
          source === 'USER' ? this.md.freshQuote(inst.symbol) : this.md.peekQuote(inst.symbol);
        if (!quote) return null;
        const side = pos.side === 'LONG' ? 'SELL' : 'BUY';
        const order = await ctx.tx.order.create({
          data: {
            accountId,
            clientOrderId: `close-${source.toLowerCase()}-${pos.id}-${Date.now()}`,
            instrumentId: inst.id,
            side,
            type: 'MARKET',
            qty,
            leverage: pos.leverage,
            reduceOnly: true,
            status: 'PENDING',
            source,
          },
        });
        await this.auditOrder(ctx, 'order.placed', order, { positionId: pos.id });
        const filled = await this.fill(ctx, order, inst, marketExecution(side, qty, quote, inst));
        return toOrderDto(filled, inst);
      },
      { allowInactive: source !== 'USER' },
    );
  }

  async closeAll(
    userId: string | null,
    accountId: string,
    source: OrderSource = 'USER',
  ): Promise<number> {
    const positions = await this.prisma.position.findMany({
      where: { accountId, status: 'OPEN', ...(userId ? { account: { userId } } : {}) },
      select: { id: true },
    });
    for (const p of positions) await this.closePosition(userId, accountId, p.id, undefined, source);
    if (source !== 'USER')
      this.logger.warn(`${source}: closed ${positions.length} positions on ${accountId}`);
    return positions.length;
  }

  async updatePosition(
    userId: string,
    accountId: string,
    positionId: string,
    dto: UpdatePositionDto,
  ) {
    return this.withAccount(accountId, userId, async (ctx) => {
      const pos = await ctx.tx.position.findFirst({
        where: { id: positionId, accountId, status: 'OPEN' },
      });
      if (!pos) throw Errors.notFound('Position');
      const inst = this.md.instrumentById(pos.instrumentId);
      const quote = this.md.freshQuote(inst.symbol);
      const long = pos.side === 'LONG';
      const px = long ? quote.bid : quote.ask;
      const sl =
        dto.slPrice === undefined
          ? pos.slPrice
          : dto.slPrice === null
            ? null
            : parsePrice(dto.slPrice, inst)!;
      const tp =
        dto.tpPrice === undefined
          ? pos.tpPrice
          : dto.tpPrice === null
            ? null
            : parsePrice(dto.tpPrice, inst)!;
      if (sl !== null && (long ? sl >= px : sl <= px))
        throw Errors.unprocessable('SL_INVALID', 'Stop loss would trigger immediately');
      if (tp !== null && (long ? tp <= px : tp >= px))
        throw Errors.unprocessable('TP_INVALID', 'Take profit would trigger immediately');
      const updated = await ctx.tx.position.update({
        where: { id: pos.id },
        data: { slPrice: sl, tpPrice: tp },
      });
      await this.audit.append(ctx.tx, {
        actorType: 'USER',
        actorId: userId,
        action: 'position.updated',
        entityType: 'Position',
        entityId: pos.id,
        data: { slPrice: sl, tpPrice: tp },
      });
      ctx.events.push({
        type: 'position.update',
        payload: { id: pos.id, symbol: inst.symbol, status: 'OPEN' },
      });
      return updated;
    });
  }

  /** Demo accounts only: reset to the initial virtual balance (requires a flat account). */
  async resetDemo(userId: string, accountId: string) {
    return this.withAccount(accountId, userId, async (ctx) => {
      if (ctx.account.kind !== 'DEMO') throw Errors.unprocessable('NOT_A_DEMO_ACCOUNT');
      const open = await ctx.tx.position.count({ where: { accountId, status: 'OPEN' } });
      if (open > 0) throw Errors.unprocessable('POSITIONS_OPEN', 'Close all positions first');
      const pending = await ctx.tx.order.findMany({ where: { accountId, status: 'OPEN' } });
      for (const o of pending) {
        await ctx.tx.order.update({ where: { id: o.id }, data: { status: 'CANCELLED' } });
        ctx.closed.push(o.id);
      }
      const delta = ctx.account.initialBalanceMinor - ctx.account.balanceMinor;
      await ctx.tx.ledgerEntry.create({
        data: {
          accountId,
          type: 'RESET',
          amountMinor: delta,
          balanceAfterMinor: ctx.account.initialBalanceMinor,
          refType: 'account',
          refId: accountId,
        },
      });
      await ctx.tx.tradingAccount.update({
        where: { id: accountId },
        data: {
          balanceMinor: ctx.account.initialBalanceMinor,
          highWaterMarkMinor: ctx.account.initialBalanceMinor,
        },
      });
      ctx.account.balanceMinor = ctx.account.initialBalanceMinor;
      await this.audit.append(ctx.tx, {
        actorType: 'USER',
        actorId: userId,
        action: 'account.reset',
        entityType: 'TradingAccount',
        entityId: accountId,
        data: { deltaMinor: delta },
      });
      ctx.events.push({
        type: 'account.status',
        payload: { status: ctx.account.status, reason: 'RESET' },
      });
    });
  }

  // ---------------------------------------------------------------- account opening

  /**
   * Open a rule-governed (challenge/funded) simulated account. Used by checkout (phase 6)
   * and, in development, by the example-account helper.
   */
  async openRuleAccount(args: OpenRuleAccountArgs): Promise<string> {
    const id = await this.prisma.$transaction((tx) => this.openRuleAccountTx(tx, args));
    await this.state.reload(id);
    return id;
  }

  /**
   * Create a rule-bound account inside the caller's transaction. The caller must call
   * `AccountStateService.reload(id)` after the commit so the account is evaluated live.
   */
  async openRuleAccountTx(tx: Tx, args: OpenRuleAccountArgs): Promise<string> {
    const ruleSet = await tx.ruleSet.findUniqueOrThrow({ where: { id: args.ruleSetId } });
    const today = tradingDateKey();
    const acc = await tx.tradingAccount.create({
      data: {
        userId: args.userId,
        kind: args.kind,
        status: args.kind === 'FUNDED' ? 'FUNDED_ACTIVE' : 'ACTIVE',
        label: args.label,
        initialBalanceMinor: args.initialBalanceMinor,
        balanceMinor: args.initialBalanceMinor,
        highWaterMarkMinor: args.initialBalanceMinor,
        maxLeverage: ruleSet.maxLeverage,
        ruleSetId: ruleSet.id,
        ruleHighWaterMarkMinor: args.initialBalanceMinor,
        dayStartBalanceMinor: args.initialBalanceMinor,
        dayStartEquityMinor: args.initialBalanceMinor,
        dayStartDate: today,
        payoutCycleStartedAt: new Date(),
        payoutBaselineMinor: args.initialBalanceMinor,
        purchaseId: args.purchaseId ?? null,
      },
    });
    await tx.ledgerEntry.create({
      data: {
        accountId: acc.id,
        type: 'INITIAL_CAPITAL',
        amountMinor: args.initialBalanceMinor,
        balanceAfterMinor: args.initialBalanceMinor,
        refType: 'account',
        refId: acc.id,
      },
    });
    await this.audit.append(tx, {
      actorType: args.actor.type,
      actorId: args.actor.id,
      action: 'account.created',
      entityType: 'TradingAccount',
      entityId: acc.id,
      data: {
        kind: args.kind,
        ruleSetId: ruleSet.id,
        ruleSetVersion: ruleSet.version,
        initialBalanceMinor: args.initialBalanceMinor,
        purchaseId: args.purchaseId ?? null,
      },
    });
    return acc.id;
  }

  // ---------------------------------------------------------------- rules

  /** Persist rule state (high-water mark / day start). No trading side effects. */
  async persistRuleState(patch: RuleStatePatch): Promise<void> {
    const { accountId, ...data } = patch;
    await this.withAccount(
      accountId,
      null,
      async (ctx) => {
        if (!ctx.account.ruleSetId) return;
        await ctx.tx.tradingAccount.update({ where: { id: accountId }, data });
      },
      { allowInactive: true },
    );
  }

  /**
   * Hard rule breached: close every position at market (SYSTEM_BREACH), cancel open orders,
   * mark the account FAILED and record the violation. Idempotent: a FAILED account is skipped.
   */
  async failAccount(b: BreachEvent): Promise<void> {
    await this.withAccount(
      b.accountId,
      null,
      async (ctx) => {
        const { tx, account } = ctx;
        if (account.status !== 'ACTIVE' && account.status !== 'FUNDED_ACTIVE') return;
        const positions = await tx.position.findMany({
          where: { accountId: account.id, status: 'OPEN' },
        });
        for (const pos of positions) {
          const inst = this.md.instrumentById(pos.instrumentId);
          const quote = this.md.peekQuote(inst.symbol) ?? {
            bid: pos.avgEntryPrice,
            ask: pos.avgEntryPrice,
            ts: Date.now(),
          };
          const side = pos.side === 'LONG' ? 'SELL' : 'BUY';
          const order = await tx.order.create({
            data: {
              accountId: account.id,
              clientOrderId: `breach-${pos.id}`,
              instrumentId: inst.id,
              side,
              type: 'MARKET',
              qty: pos.qty,
              leverage: pos.leverage,
              reduceOnly: true,
              status: 'PENDING',
              source: 'SYSTEM_BREACH',
            },
          });
          await this.auditOrder(ctx, 'order.placed', order, { positionId: pos.id, reason: b.rule });
          await this.fill(ctx, order, inst, marketExecution(side, pos.qty, quote, inst));
        }
        const open = await tx.order.findMany({ where: { accountId: account.id, status: 'OPEN' } });
        for (const o of open) {
          const cancelled = await tx.order.update({
            where: { id: o.id },
            data: { status: 'CANCELLED' },
          });
          await this.auditOrder(ctx, 'order.cancelled', cancelled, { reason: b.rule });
          ctx.closed.push(o.id);
          ctx.events.push({
            type: 'order.update',
            payload: toOrderDto(cancelled, this.md.instrumentById(o.instrumentId)),
          });
        }
        await tx.ruleViolation.create({
          data: {
            accountId: account.id,
            ruleSetId: account.ruleSetId!,
            rule: b.rule,
            floorMinor: b.floorMinor,
            observedMinor: b.equityMinor,
            details: JSON.parse(
              JSON.stringify(b.evaluation.rules, (_k, v: unknown) =>
                typeof v === 'bigint' ? v.toString() : v,
              ),
            ) as object,
          },
        });
        await tx.tradingAccount.update({
          where: { id: account.id },
          data: { status: 'FAILED', endedAt: new Date(), failReason: b.rule },
        });
        account.status = 'FAILED';
        await this.audit.append(tx, {
          actorType: 'SYSTEM',
          action: 'rule.breached',
          entityType: 'TradingAccount',
          entityId: account.id,
          data: {
            rule: b.rule,
            floorMinor: b.floorMinor,
            equityMinor: b.equityMinor,
            ruleSetId: account.ruleSetId,
          },
        });
        await this.audit.append(tx, {
          actorType: 'SYSTEM',
          action: 'account.failed',
          entityType: 'TradingAccount',
          entityId: account.id,
          data: { reason: b.rule, finalBalanceMinor: account.balanceMinor },
        });
        ctx.events.push({ type: 'account.status', payload: { status: 'FAILED', reason: b.rule } });
        this.logger.warn(
          `Account ${account.id} FAILED: ${b.rule} (equity ${b.equityMinor} ≤ floor ${b.floorMinor})`,
        );
      },
      { allowInactive: true },
    );
  }

  // ---------------------------------------------------------------- funding

  /**
   * Settle funding for every open position in an instrument at `fundingTime`.
   * Idempotent per (position, fundingTime) via `lastFundingAt`.
   */
  async settleFunding(
    instrumentId: string,
    fundingTime: number,
    markPrice: bigint,
    rate: bigint,
  ): Promise<number> {
    const at = new Date(fundingTime);
    const positions = await this.prisma.position.findMany({
      where: {
        instrumentId,
        status: 'OPEN',
        OR: [{ lastFundingAt: null }, { lastFundingAt: { lt: at } }],
        openedAt: { lt: at },
      },
      select: { id: true, accountId: true },
    });
    const inst = this.md.instrumentById(instrumentId);
    let settled = 0;
    for (const { id, accountId } of positions) {
      await this.withAccount(
        accountId,
        null,
        async (ctx) => {
          const pos = await ctx.tx.position.findUnique({ where: { id } });
          if (!pos || pos.status !== 'OPEN' || (pos.lastFundingAt && pos.lastFundingAt >= at))
            return;
          const amount = fundingPaymentMinor(
            {
              side: pos.side,
              qty: pos.qty,
              avgEntryPrice: pos.avgEntryPrice,
              leverage: pos.leverage,
            },
            markPrice,
            rate,
            inst,
          );
          const balance = ctx.account.balanceMinor + amount;
          await ctx.tx.ledgerEntry.create({
            data: {
              accountId,
              type: 'FUNDING',
              amountMinor: amount,
              balanceAfterMinor: balance,
              refType: 'position',
              refId: pos.id,
            },
          });
          await ctx.tx.tradingAccount.update({
            where: { id: accountId },
            data: { balanceMinor: balance },
          });
          ctx.account.balanceMinor = balance;
          await ctx.tx.position.update({
            where: { id },
            data: { fundingAccruedMinor: pos.fundingAccruedMinor + amount, lastFundingAt: at },
          });
          await this.audit.append(ctx.tx, {
            actorType: 'SYSTEM',
            action: 'funding.settled',
            entityType: 'Position',
            entityId: id,
            data: { accountId, rate, markPrice, amountMinor: amount, fundingTime },
          });
          ctx.events.push({
            type: 'position.update',
            payload: { id, symbol: inst.symbol, status: 'OPEN' },
          });
          settled++;
        },
        { allowInactive: true },
      );
    }
    this.fundingSettled.set(instrumentId, fundingTime);
    return settled;
  }
}
