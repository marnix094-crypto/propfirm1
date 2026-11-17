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
  isStopOut,
  type AccountMetrics,
  type MarkedPosition,
  type PositionState,
} from '@brand/engine';
import { APP_CONFIG, type AppConfig } from '../../config/env.js';
import { PrismaService } from '../../infra/prisma.service.js';
import { MarketDataService } from '../market-data/market-data.service.js';
import { tradingDayStart } from './day.js';
import { TradingEvents } from './events.js';

export interface LivePosition {
  id: string;
  instrumentId: string;
  symbol: string;
  state: PositionState;
  slPrice: bigint | null;
  tpPrice: bigint | null;
}

export interface LiveAccount {
  id: string;
  userId: string;
  balanceMinor: bigint;
  stopOutLevelBps: number;
  dayStartBalanceMinor: bigint;
  dayStartTs: number;
  positions: Map<string, LivePosition>; // by instrumentId
}

const PUSH_INTERVAL_MS = 1000;
const SNAPSHOT_INTERVAL_MS = 60_000;

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
    }
    this.logger.log(`Loaded ${rows.length} accounts with open positions`);
  }

  onModuleDestroy() {
    this.sub?.unsubscribe();
    if (this.snapshotTimer) clearInterval(this.snapshotTimer);
  }

  /** Reload one account from the database (call after every committed change). */
  async reload(accountId: string): Promise<LiveAccount | null> {
    const acc = await this.prisma.tradingAccount.findUnique({
      where: { id: accountId },
      include: { positions: { where: { status: 'OPEN' } } },
    });
    this.unindex(accountId);
    if (!acc) return null;
    const dayStart = tradingDayStart();
    const prev = this.accounts.get(accountId);
    const live: LiveAccount = {
      id: acc.id,
      userId: acc.userId,
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
      if (!live) continue;
      const m = this.metrics(live);
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
