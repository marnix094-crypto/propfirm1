import { Injectable } from '@nestjs/common';
import {
  toDecimalString,
  unrealizedPnlMinor,
  usedMarginMinor,
  closePrice,
  directionOf,
  fundingProgress,
  monthCalendar,
  tradeStats,
  traderShareMinor,
} from '@brand/engine';
import { tradingDateKey } from './day.js';
import { PrismaService } from '../../infra/prisma.service.js';
import { Errors } from '../../common/errors.js';
import { MarketDataService } from '../market-data/market-data.service.js';
import { toFundingParams } from '../rules/rules.service.js';
import { AccountStateService } from './account-state.service.js';
import { toFillDto, toLedgerDto, toOrderDto } from './mappers.js';
import type {
  AccountDto,
  EquityPointDto,
  AccountRulesDto,
  FundingProgressDto,
  PerformanceDto,
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

  /** Profit split, payout eligibility and scaling progress of a funded account. */
  async funding(userId: string, accountId: string): Promise<FundingProgressDto> {
    const acc = await this.prisma.tradingAccount.findFirst({
      where: { id: accountId, userId },
      include: { ruleSet: true },
    });
    if (!acc) throw Errors.notFound('Account');
    const baseline = acc.payoutBaselineMinor ?? acc.initialBalanceMinor;
    const profit = acc.balanceMinor > baseline ? acc.balanceMinor - baseline : 0n;
    const split = acc.ruleSet?.profitSplitBps ?? null;
    const params = acc.ruleSet ? toFundingParams(acc.ruleSet) : null;
    const base = {
      isExample: acc.ruleSet?.isExample ?? false,
      accountSizeMinor: acc.initialBalanceMinor.toString(),
      profitSplitBps: split,
    };
    if (!params || acc.kind !== 'FUNDED') {
      return {
        ...base,
        available: false,
        profitMinor: profit.toString(),
        traderShareMinor: (split == null ? 0n : traderShareMinor(profit, split)).toString(),
        payout: null,
        scaling: null,
      };
    }
    const openPositions = await this.prisma.position.count({
      where: { accountId, status: 'OPEN' },
    });
    const p = fundingProgress(params, {
      initialBalanceMinor: acc.initialBalanceMinor,
      balanceMinor: acc.balanceMinor,
      payoutBaselineMinor: baseline,
      scalingProfitMinor: acc.balanceMinor - acc.initialBalanceMinor + acc.paidOutSinceScaleMinor,
      cycleStartedAtMs: (acc.payoutCycleStartedAt ?? acc.createdAt).getTime(),
      nowMs: Date.now(),
      cycleTradingDays: acc.cycleTradingDays,
      payoutsCount: acc.payoutsCount,
      hasOpenPositions: openPositions > 0,
    });
    return {
      ...base,
      available: true,
      profitMinor: p.profitMinor.toString(),
      traderShareMinor: p.traderShareMinor.toString(),
      payout: {
        eligible: p.payout.eligible && acc.status === 'FUNDED_ACTIVE',
        eligibleFrom: new Date(p.payout.eligibleFromMs).toISOString(),
        conditions: p.payout.conditions.map((c) => ({
          code: c.code,
          met: c.met,
          current: c.current.toString(),
          required: c.required.toString(),
        })),
        kycRequired: true,
      },
      scaling: {
        profitMinor: p.scaling.profitMinor.toString(),
        targetMinor: p.scaling.targetMinor.toString(),
        targetBps: params.scalingProfitTargetBps,
        payouts: p.scaling.payouts,
        requiredPayouts: p.scaling.requiredPayouts,
        eligible: p.scaling.eligible && acc.status === 'FUNDED_ACTIVE',
        stepBps: params.scalingStepBps,
        nextSizeMinor: p.scaling.nextSizeMinor.toString(),
        maxSizeMinor: params.scalingMaxBalanceMinor.toString(),
        atMaximum: p.scaling.atMaximum,
      },
    };
  }

  /** Win rate & trade statistics (all time) plus a daily PnL calendar for one month. */
  async performance(userId: string, accountId: string, month?: string): Promise<PerformanceDto> {
    const acc = await this.prisma.tradingAccount.findFirst({
      where: { id: accountId, userId },
      select: { id: true },
    });
    if (!acc) throw Errors.notFound('Account');
    const m = month ?? tradingDateKey().slice(0, 7);
    const [y, mo] = m.split('-').map(Number) as [number, number];
    // Amsterdam is UTC+1/+2: a one-day margin on both sides covers the whole local month.
    const from = new Date(Date.UTC(y, mo - 1, 1) - 86_400_000);
    const to = new Date(Date.UTC(y, mo, 1) + 86_400_000);

    const fills = await this.prisma.fill.findMany({
      where: { accountId, realizedPnlMinor: { not: 0n } },
      select: { realizedPnlMinor: true, commissionMinor: true, executedAt: true },
    });
    const trades = fills.map((f) => ({
      netPnlMinor: f.realizedPnlMinor - f.commissionMinor,
      day: tradingDateKey(f.executedAt),
    }));
    const ledger = await this.prisma.ledgerEntry.findMany({
      where: {
        accountId,
        type: { in: ['REALIZED_PNL', 'COMMISSION', 'FUNDING'] },
        createdAt: { gte: from, lt: to },
      },
      select: { amountMinor: true, createdAt: true },
    });
    const s = tradeStats(trades);
    const c = monthCalendar(
      m,
      ledger.map((l) => ({ amountMinor: l.amountMinor, day: tradingDateKey(l.createdAt) })),
      trades,
    );
    const str = (v: bigint | null) => (v === null ? null : v.toString());
    return {
      stats: {
        trades: s.trades,
        wins: s.wins,
        losses: s.losses,
        winRateBps: s.winRateBps,
        grossProfitMinor: s.grossProfitMinor.toString(),
        grossLossMinor: s.grossLossMinor.toString(),
        netPnlMinor: s.netPnlMinor.toString(),
        avgWinMinor: str(s.avgWinMinor),
        avgLossMinor: str(s.avgLossMinor),
        profitFactorBps: s.profitFactorBps,
        expectancyMinor: str(s.expectancyMinor),
        bestTradeMinor: str(s.bestTradeMinor),
        worstTradeMinor: str(s.worstTradeMinor),
      },
      calendar: {
        month: c.month,
        days: c.days.map((d) => ({
          date: d.day,
          pnlMinor: d.pnlMinor.toString(),
          trades: d.trades,
        })),
        netMinor: c.netMinor.toString(),
        greenDays: c.greenDays,
        redDays: c.redDays,
        bestDayMinor: str(c.bestDayMinor),
        worstDayMinor: str(c.worstDayMinor),
      },
    };
  }
}
