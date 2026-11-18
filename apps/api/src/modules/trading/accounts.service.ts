import { Injectable } from '@nestjs/common';
import {
  toDecimalString,
  unrealizedPnlMinor,
  usedMarginMinor,
  closePrice,
  directionOf,
} from '@brand/engine';
import { PrismaService } from '../../infra/prisma.service.js';
import { Errors } from '../../common/errors.js';
import { MarketDataService } from '../market-data/market-data.service.js';
import { AccountStateService } from './account-state.service.js';
import { toFillDto, toLedgerDto, toOrderDto } from './mappers.js';
import type {
  AccountDto,
  EquityPointDto,
  AccountRulesDto,
  EquityQuery,
  LedgerEntryDto,
  PositionDto,
} from './dto.js';

const RANGE_MS: Record<EquityQuery['range'], number> = {
  '1D': 86_400_000,
  '1W': 7 * 86_400_000,
  '1M': 30 * 86_400_000,
  '3M': 91 * 86_400_000,
  '6M': 182 * 86_400_000,
  '1Y': 365 * 86_400_000,
};
const MAX_POINTS = 300;

/** Read side for accounts: snapshots, positions, orders, fills, ledger, equity curve. */
@Injectable()
export class AccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly md: MarketDataService,
    private readonly state: AccountStateService,
  ) {}

  private async owned(userId: string, accountId: string) {
    const acc = await this.prisma.tradingAccount.findFirst({ where: { id: accountId, userId } });
    if (!acc) throw Errors.notFound('Account');
    return acc;
  }

  async list(userId: string): Promise<AccountDto[]> {
    const rows = await this.prisma.tradingAccount.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });
    return Promise.all(rows.map((r) => this.snapshot(userId, r.id)));
  }

  async snapshot(userId: string, accountId: string): Promise<AccountDto> {
    const acc = await this.owned(userId, accountId);
    const live = this.state.get(accountId) ?? (await this.state.reload(accountId))!;
    const m = this.state.metrics(live);
    return {
      id: acc.id,
      kind: acc.kind,
      label: acc.label,
      status: acc.status,
      isSimulated: acc.isSimulated,
      currency: acc.currency,
      initialBalanceMinor: acc.initialBalanceMinor.toString(),
      balanceMinor: m.balanceMinor.toString(),
      equityMinor: m.equityMinor.toString(),
      unrealizedPnlMinor: m.unrealizedPnlMinor.toString(),
      usedMarginMinor: m.usedMarginMinor.toString(),
      freeMarginMinor: m.freeMarginMinor.toString(),
      marginLevelBps: m.marginLevelBps?.toString() ?? null,
      dailyPnlMinor: this.state.dailyPnlMinor(live, m.equityMinor).toString(),
      maxLeverage: acc.maxLeverage,
      seq: acc.seq.toString(),
      hasRules: acc.ruleSetId !== null,
      failReason: acc.failReason,
    };
  }

  /** Rule set and live progress (meters) for challenge/funded accounts. */
  async rules(userId: string, accountId: string): Promise<AccountRulesDto> {
    const acc = await this.prisma.tradingAccount.findFirst({
      where: { id: accountId, userId },
      include: { ruleSet: true },
    });
    if (!acc) throw Errors.notFound('Account');
    if (!acc.ruleSet) {
      return {
        ruleSet: null,
        rules: [],
        breach: null,
        passed: false,
        status: acc.status,
        failReason: acc.failReason,
        tradingDays: acc.tradingDaysCount,
      };
    }
    const live = this.state.get(accountId) ?? (await this.state.reload(accountId))!;
    const ev = this.state.peekEvaluation(live);
    const r = acc.ruleSet;
    const payload = ev ? this.state.rulesPayload(ev) : { rules: [], breach: null, passed: false };
    return {
      ruleSet: {
        code: r.code,
        version: r.version,
        name: r.name,
        isExample: r.isExample,
        maxDailyLossBps: r.maxDailyLossBps,
        maxDrawdownBps: r.maxDrawdownBps,
        drawdownType: r.drawdownType,
        profitTargetBps: r.profitTargetBps,
        minTradingDays: r.minTradingDays,
        profitSplitBps: r.profitSplitBps,
        maxLeverage: r.maxLeverage,
      },
      ...payload,
      // A failed account keeps showing what failed it.
      breach: acc.status === 'FAILED' ? acc.failReason : payload.breach,
      status: acc.status,
      failReason: acc.failReason,
      tradingDays: acc.tradingDaysCount,
    };
  }

  async positions(userId: string, accountId: string): Promise<PositionDto[]> {
    await this.owned(userId, accountId);
    const rows = await this.prisma.position.findMany({
      where: { accountId, status: 'OPEN' },
      orderBy: { openedAt: 'asc' },
    });
    return rows.map((p) => {
      const inst = this.md.instrumentById(p.instrumentId);
      const state = {
        side: p.side,
        qty: p.qty,
        avgEntryPrice: p.avgEntryPrice,
        leverage: p.leverage,
      };
      const quote = this.md.peekQuote(inst.symbol);
      const px = (v: bigint | null) => (v === null ? null : toDecimalString(v, inst.priceDecimals));
      return {
        id: p.id,
        symbol: inst.symbol,
        side: p.side,
        qty: toDecimalString(p.qty, inst.qtyDecimals),
        avgEntryPrice: px(p.avgEntryPrice)!,
        markPrice: quote ? px(closePrice(directionOf(p.side), quote)) : null,
        leverage: p.leverage,
        usedMarginMinor: usedMarginMinor(state, inst).toString(),
        unrealizedPnlMinor: quote ? unrealizedPnlMinor(state, quote, inst).toString() : null,
        realizedPnlMinor: p.realizedPnlMinor.toString(),
        fundingAccruedMinor: p.fundingAccruedMinor.toString(),
        slPrice: px(p.slPrice),
        tpPrice: px(p.tpPrice),
        openedAt: p.openedAt.toISOString(),
      };
    });
  }

  async orders(userId: string, accountId: string, status: 'open' | 'history') {
    await this.owned(userId, accountId);
    const rows = await this.prisma.order.findMany({
      where: {
        accountId,
        status: status === 'open' ? 'OPEN' : { in: ['FILLED', 'CANCELLED', 'REJECTED'] },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return rows.map((o) => toOrderDto(o, this.md.instrumentById(o.instrumentId)));
  }

  async fills(userId: string, accountId: string) {
    await this.owned(userId, accountId);
    const rows = await this.prisma.fill.findMany({
      where: { accountId },
      orderBy: { executedAt: 'desc' },
      take: 200,
    });
    return rows.map((f) => toFillDto(f, this.md.instrumentById(f.instrumentId)));
  }

  async ledger(userId: string, accountId: string): Promise<LedgerEntryDto[]> {
    await this.owned(userId, accountId);
    const rows = await this.prisma.ledgerEntry.findMany({
      where: { accountId },
      orderBy: { id: 'desc' },
      take: 200,
    });
    return rows.map(toLedgerDto);
  }

  /** Equity curve, downsampled to ≤ 300 points (last point per bucket). */
  async equity(
    userId: string,
    accountId: string,
    range: EquityQuery['range'],
  ): Promise<EquityPointDto[]> {
    const acc = await this.owned(userId, accountId);
    const from = new Date(Math.max(Date.now() - RANGE_MS[range], acc.createdAt.getTime()));
    const rows = await this.prisma.equitySnapshot.findMany({
      where: { accountId, ts: { gte: from } },
      orderBy: { ts: 'asc' },
      select: { ts: true, equityMinor: true, balanceMinor: true },
    });
    const bucket = Math.max(1, Math.ceil(RANGE_MS[range] / MAX_POINTS));
    const byBucket = new Map<number, (typeof rows)[number]>();
    for (const r of rows) byBucket.set(Math.floor(r.ts.getTime() / bucket), r);
    const points = [...byBucket.values()].map((r) => ({
      t: r.ts.getTime(),
      equityMinor: r.equityMinor.toString(),
      balanceMinor: r.balanceMinor.toString(),
    }));
    // Always start at the account's opening balance and end at "now".
    const now = await this.snapshot(userId, accountId);
    if (points.length === 0 || points[0]!.t > acc.createdAt.getTime() + 1000) {
      if (from.getTime() <= acc.createdAt.getTime() + 1000) {
        points.unshift({
          t: acc.createdAt.getTime(),
          equityMinor: acc.initialBalanceMinor.toString(),
          balanceMinor: acc.initialBalanceMinor.toString(),
        });
      }
    }
    points.push({ t: Date.now(), equityMinor: now.equityMinor, balanceMinor: now.balanceMinor });
    return points;
  }
}
