import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { Subject, type Subscription } from 'rxjs';
import {
  accountMetrics,
  evaluateRules,
  isStopOut,
  nextHighWaterMark,
  type AccountMetrics,
  type MarkedPosition,
  type PositionState,
  type RuleCode,
  type RuleEvaluation,
  type RuleParams,
  type RuleState,
} from '@brand/engine';
import type { AccountStatus } from '../../generated/prisma/client.js';
import { toRuleParams } from '../rules/rules.service.js';
import { APP_CONFIG, type AppConfig } from '../../config/env.js';
import { PrismaService } from '../../infra/prisma.service.js';
import { MarketDataService } from '../market-data/market-data.service.js';
import { tradingDateKey, tradingDayStart } from './day.js';
import { TradingEvents } from './events.js';

export interface LivePosition {
  id: string;
  instrumentId: string;
  symbol: string;
  state: PositionState;
  slPrice: bigint | null;
  tpPrice: bigint | null;
}

export interface LiveRules {
  ruleSetId: string;
  params: RuleParams;
  hwm: bigint;
  hwmPersisted: bigint;
  dayStartBalance: bigint;
  dayStartEquity: bigint;
  dayStartDate: string;
  tradingDays: number;
}

export interface BreachEvent {
  accountId: string;
  rule: RuleCode;
  floorMinor: bigint;
  equityMinor: bigint;
  evaluation: RuleEvaluation;
}

export interface RuleStatePatch {
  accountId: string;
  ruleHighWaterMarkMinor?: bigint;
  dayStartBalanceMinor?: bigint;
  dayStartEquityMinor?: bigint;
  dayStartDate?: string;
}

const TRADABLE: AccountStatus[] = ['ACTIVE', 'FUNDED_ACTIVE'];

export interface LiveAccount {
  id: string;
  userId: string;
  status: AccountStatus;
  initialBalanceMinor: bigint;
  rules: LiveRules | null;
  balanceMinor: bigint;
  stopOutLevelBps: number;
  dayStartBalanceMinor: bigint;
  dayStartTs: number;
  positions: Map<string, LivePosition>; // by instrumentId
}

const PUSH_INTERVAL_MS = 1000;
const SNAPSHOT_INTERVAL_MS = 60_000;
const RULE_HOUSEKEEPING_MS = 15_000;

/**
 * In-memory view of active accounts with open positions, kept in sync after every commit.
 * Drives live equity pushes, stop-out detection and equity snapshots.
 * (Phase 4 hooks the challenge rule engine into `onQuote`.)
 */
@Injectable()
export class AccountStateService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(AccountStateService.name);
  private readonly accounts = new Map<string, LiveAccount>();
  private readonly byInstrument = new Map<string, Set<string>>();
  private readonly lastPush = new Map<string, number>();
  private sub?: Subscription;
  private snapshotTimer?: NodeJS.Timeout;

  /** Accounts whose margin level hit the stop-out level. */
  readonly stopOut$ = new Subject<string>();
  /** Accounts that breached a hard rule (daily loss / max drawdown). */
  readonly breach$ = new Subject<BreachEvent>();
  /** Rule state to persist (high-water mark, day start). */
  readonly ruleState$ = new Subject<RuleStatePatch>();
  private ruleTimer?: NodeJS.Timeout;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly prisma: PrismaService,
    private readonly md: MarketDataService,
    private readonly events: TradingEvents,
  ) {}

  async onApplicationBootstrap() {
    const rows = await this.prisma.tradingAccount.findMany({
      where: {
        status: { in: ['ACTIVE', 'FUNDED_ACTIVE'] },
        positions: { some: { status: 'OPEN' } },
      },
      select: { id: true },
    });
    for (const r of rows) await this.reload(r.id);
    if (this.config.riskLoopEnabled) {
      this.sub = this.md.quotes$.subscribe(({ instrumentId }) => this.onQuote(instrumentId));
      this.snapshotTimer = setInterval(() => void this.snapshotAll(), SNAPSHOT_INTERVAL_MS);
      this.ruleTimer = setInterval(() => void this.ruleHousekeeping(), RULE_HOUSEKEEPING_MS);
    }
    this.logger.log(`Loaded ${rows.length} accounts with open positions`);
  }

  onModuleDestroy() {
    this.sub?.unsubscribe();
    if (this.snapshotTimer) clearInterval(this.snapshotTimer);
    if (this.ruleTimer) clearInterval(this.ruleTimer);
  }

  /** Reload one account from the database (call after every committed change). */
  async reload(accountId: string): Promise<LiveAccount | null> {
    const acc = await this.prisma.tradingAccount.findUnique({
      where: { id: accountId },
      include: { positions: { where: { status: 'OPEN' } }, ruleSet: true },
    });
    this.unindex(accountId);
    if (!acc) return null;
    const dayStart = tradingDayStart();
    const prev = this.accounts.get(accountId);
    const live: LiveAccount = {
      id: acc.id,
      userId: acc.userId,
      status: acc.status,
      initialBalanceMinor: acc.initialBalanceMinor,
      rules: null,
      balanceMinor: acc.balanceMinor,
      stopOutLevelBps: acc.stopOutLevelBps,
      dayStartBalanceMinor:
        prev && prev.dayStartTs === dayStart.getTime()
          ? prev.dayStartBalanceMinor
          : await this.balanceAt(acc.id, dayStart, acc.initialBalanceMinor),
      dayStartTs: dayStart.getTime(),
      positions: new Map(),
    };
    for (const p of acc.positions) {
      const inst = this.md.instrumentById(p.instrumentId);
      live.positions.set(p.instrumentId, {
        id: p.id,
        instrumentId: p.instrumentId,
        symbol: inst.symbol,
        state: { side: p.side, qty: p.qty, avgEntryPrice: p.avgEntryPrice, leverage: p.leverage },
        slPrice: p.slPrice,
        tpPrice: p.tpPrice,
      });
    }
    if (acc.ruleSet) {
      const hwm = acc.ruleHighWaterMarkMinor ?? acc.initialBalanceMinor;
      live.rules = {
        ruleSetId: acc.ruleSet.id,
        params: toRuleParams(acc.ruleSet),
        hwm: prev?.rules && prev.rules.hwm > hwm ? prev.rules.hwm : hwm,
        hwmPersisted: hwm,
        dayStartBalance: acc.dayStartBalanceMinor ?? acc.balanceMinor,
        dayStartEquity: acc.dayStartEquityMinor ?? acc.balanceMinor,
        dayStartDate: acc.dayStartDate ?? '',
        tradingDays: acc.tradingDaysCount,
      };
      this.rollDayIfNeeded(live);
    }
    this.accounts.set(accountId, live);
    for (const instrumentId of live.positions.keys()) {
      if (!this.byInstrument.has(instrumentId)) this.byInstrument.set(instrumentId, new Set());
      this.byInstrument.get(instrumentId)!.add(accountId);
    }
    return live;
  }

  private unindex(accountId: string) {
    const prev = this.accounts.get(accountId);
    if (!prev) return;
    for (const instrumentId of prev.positions.keys())
      this.byInstrument.get(instrumentId)?.delete(accountId);
  }

  /** Balance at a point in time from the append-only ledger. */
  private async balanceAt(accountId: string, at: Date, initial: bigint): Promise<bigint> {
    const last = await this.prisma.ledgerEntry.findFirst({
      where: { accountId, createdAt: { lt: at } },
      orderBy: { id: 'desc' },
      select: { balanceAfterMinor: true },
    });
    return last?.balanceAfterMinor ?? initial;
  }

  get(accountId: string): LiveAccount | undefined {
    return this.accounts.get(accountId);
  }

  positionsWithSlTp(instrumentId: string): { accountId: string; position: LivePosition }[] {
    const out: { accountId: string; position: LivePosition }[] = [];
    for (const accountId of this.byInstrument.get(instrumentId) ?? []) {
      const p = this.accounts.get(accountId)?.positions.get(instrumentId);
      if (p && (p.slPrice !== null || p.tpPrice !== null)) out.push({ accountId, position: p });
    }
    return out;
  }

  /** Mark-to-market metrics; positions without a fresh quote are marked at entry (no PnL). */
  metrics(live: Pick<LiveAccount, 'balanceMinor' | 'positions'>): AccountMetrics {
    const marked: MarkedPosition[] = [];
    for (const p of live.positions.values()) {
      const spec = this.md.instrumentById(p.instrumentId);
      const quote = this.md.peekQuote(p.symbol) ?? {
        bid: p.state.avgEntryPrice,
        ask: p.state.avgEntryPrice,
        ts: 0,
      };
      marked.push({ position: p.state, spec, quote });
    }
    return accountMetrics(live.balanceMinor, marked);
  }

  dailyPnlMinor(live: LiveAccount, equity: bigint): bigint {
    return equity - live.dayStartBalanceMinor;
  }

  private onQuote(instrumentId: string) {
    const ids = this.byInstrument.get(instrumentId);
    if (!ids) return;
    const now = Date.now();
    for (const id of ids) {
      const live = this.accounts.get(id);
      if (!live || !TRADABLE.includes(live.status)) continue;
      const m = this.metrics(live);
      const ev = this.evaluate(live, m);
      if (isStopOut(m, live.stopOutLevelBps)) this.stopOut$.next(id);
      if (now - (this.lastPush.get(id) ?? 0) >= PUSH_INTERVAL_MS) {
        this.lastPush.set(id, now);
        this.events.emit({
          accountId: id,
          userId: live.userId,
          type: 'account.update',
          seq: 0n,
          payload: this.metricsPayload(live, m),
        });
        if (ev)
          this.events.emit({
            accountId: id,
            userId: live.userId,
            type: 'rule.progress',
            seq: 0n,
            payload: this.rulesPayload(ev),
          });
      }
    }
  }

  private ruleState(live: LiveAccount, r: LiveRules, m: AccountMetrics): RuleState {
    return {
      initialBalanceMinor: live.initialBalanceMinor,
      balanceMinor: m.balanceMinor,
      equityMinor: m.equityMinor,
      dayStartBalanceMinor: r.dayStartBalance,
      dayStartEquityMinor: r.dayStartEquity,
      highWaterMarkMinor: r.hwm,
      tradingDays: r.tradingDays,
    };
  }

  /**
   * Evaluate the account's rules against mark-to-market equity. Raises the trailing
   * high-water mark in memory and emits a breach event when a hard limit is hit.
   */
  evaluate(live: LiveAccount, m: AccountMetrics = this.metrics(live)): RuleEvaluation | null {
    const r = live.rules;
    if (!r) return null;
    const base = this.ruleState(live, r, m);
    r.hwm = nextHighWaterMark(r.params, base);
    const ev = evaluateRules(r.params, { ...base, highWaterMarkMinor: r.hwm });
    if (ev.breach && TRADABLE.includes(live.status)) {
      const rule = ev.rules.find((x) => x.rule === ev.breach)!;
      this.breach$.next({
        accountId: live.id,
        rule: ev.breach,
        floorMinor: rule.floorEquityMinor ?? 0n,
        equityMinor: m.equityMinor,
        evaluation: ev,
      });
    }
    return ev;
  }

  /** Evaluate immediately (fills can breach without a price move). */
  evaluateNow(accountId: string): RuleEvaluation | null {
    const live = this.accounts.get(accountId);
    if (!live || !TRADABLE.includes(live.status)) return null;
    const ev = this.evaluate(live);
    if (ev)
      this.events.emit({
        accountId,
        userId: live.userId,
        type: 'rule.progress',
        seq: 0n,
        payload: this.rulesPayload(ev),
      });
    return ev;
  }

  /** Current evaluation without side effects (read endpoints). */
  peekEvaluation(live: LiveAccount): RuleEvaluation | null {
    const r = live.rules;
    if (!r) return null;
    const base = this.ruleState(live, r, this.metrics(live));
    return evaluateRules(r.params, {
      ...base,
      highWaterMarkMinor: nextHighWaterMark(r.params, base),
    });
  }

  rulesPayload(ev: RuleEvaluation) {
    return {
      breach: ev.breach,
      passed: ev.passed,
      rules: ev.rules.map((r) => ({
        rule: r.rule,
        usedMinor: r.usedMinor.toString(),
        limitMinor: r.limitMinor.toString(),
        floorEquityMinor: r.floorEquityMinor?.toString() ?? null,
        state: r.state,
        reached: r.reached ?? null,
      })),
    };
  }

  /** New trading day (00:00 Europe/Amsterdam): reset the day-start reference. */
  private rollDayIfNeeded(live: LiveAccount) {
    const r = live.rules;
    if (!r || !TRADABLE.includes(live.status)) return;
    const today = tradingDateKey();
    if (r.dayStartDate === today) return;
    const m = this.metrics(live);
    r.dayStartDate = today;
    r.dayStartBalance = m.balanceMinor;
    r.dayStartEquity = m.equityMinor;
    this.ruleState$.next({
      accountId: live.id,
      dayStartBalanceMinor: m.balanceMinor,
      dayStartEquityMinor: m.equityMinor,
      dayStartDate: today,
    });
  }

  /** Periodic: day rollover and persisting a risen high-water mark. */
  private async ruleHousekeeping() {
    for (const live of this.accounts.values()) {
      const r = live.rules;
      if (!r || !TRADABLE.includes(live.status)) continue;
      this.rollDayIfNeeded(live);
      if (r.hwm > r.hwmPersisted) {
        r.hwmPersisted = r.hwm;
        this.ruleState$.next({ accountId: live.id, ruleHighWaterMarkMinor: r.hwm });
      }
    }
  }

  metricsPayload(live: LiveAccount, m: AccountMetrics) {
    return {
      balanceMinor: m.balanceMinor.toString(),
      equityMinor: m.equityMinor.toString(),
      unrealizedPnlMinor: m.unrealizedPnlMinor.toString(),
      usedMarginMinor: m.usedMarginMinor.toString(),
      freeMarginMinor: m.freeMarginMinor.toString(),
      marginLevelBps: m.marginLevelBps?.toString() ?? null,
      dailyPnlMinor: this.dailyPnlMinor(live, m.equityMinor).toString(),
    };
  }

  /** Persist an equity point for one account (after fills and periodically). */
  async snapshot(accountId: string) {
    const live = this.accounts.get(accountId);
    if (!live) return;
    const m = this.metrics(live);
    await this.prisma.equitySnapshot.createMany({
      data: [
        {
          accountId,
          ts: new Date(),
          balanceMinor: m.balanceMinor,
          equityMinor: m.equityMinor,
          usedMarginMinor: m.usedMarginMinor,
        },
      ],
      skipDuplicates: true,
    });
  }

  private async snapshotAll() {
    for (const [id, live] of this.accounts) {
      if (live.positions.size > 0)
        await this.snapshot(id).catch((e: Error) => this.logger.warn(e.message));
    }
  }
}
