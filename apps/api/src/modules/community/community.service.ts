import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma.service.js';
import { Errors } from '../../common/errors.js';
import type { Competition } from '../../generated/prisma/client.js';
import { AccountStateService } from '../trading/account-state.service.js';
import { TradingService } from '../trading/trading.service.js';
import { tradingDayStart } from '../trading/day.js';
import type {
  CompetitionDto,
  LeaderboardDto,
  RankingRowDto,
  TraderProfileDto,
  TransparencyDto,
  UpdateTraderProfileDto,
} from './dto.js';

/** Anonymous but stable label, e.g. "Trader 4F2A" (no personal data). */
export const anonymousName = (id: string) =>
  `Trader ${createHash('sha256').update(id).digest('hex').slice(0, 4).toUpperCase()}`;

/** Amsterdam month boundaries as UTC instants (DST-safe via Intl). */
export function amsterdamMonth(now = new Date()): {
  slug: string;
  start: Date;
  end: Date;
  label: string;
} {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Amsterdam',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(now);
  const y = Number(parts.find((p) => p.type === 'year')!.value);
  const m = Number(parts.find((p) => p.type === 'month')!.value);
  // 00:00 Europe/Amsterdam on the 1st (noon UTC is always on that local date).
  const localMidnight = (yy: number, mm: number) =>
    tradingDayStart(new Date(Date.UTC(yy, mm - 1, 1, 12)));
  const start = localMidnight(y, m);
  const end = m === 12 ? localMidnight(y + 1, 1) : localMidnight(y, m + 1);
  const label = new Intl.DateTimeFormat('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(y, m - 1, 1)));
  return { slug: `monthly-${y}-${String(m).padStart(2, '0')}`, start, end, label };
}

/** Leaderboard, competitions and public transparency figures — real data only. */
@Injectable()
export class CommunityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly state: AccountStateService,
    private readonly trading: TradingService,
  ) {}

  // ------------------------------------------------------------- profile
  async profile(userId: string): Promise<TraderProfileDto> {
    const p = await this.prisma.traderProfile.findUnique({ where: { userId } });
    return { nickname: p?.nickname ?? null, leaderboardOptIn: p?.leaderboardOptIn ?? false };
  }

  async updateProfile(userId: string, dto: UpdateTraderProfileDto): Promise<TraderProfileDto> {
    const current = await this.prisma.traderProfile.findUnique({ where: { userId } });
    const nickname = dto.nickname ?? current?.nickname;
    if (!nickname) throw Errors.unprocessable('NICKNAME_REQUIRED', 'Choose a nickname first');
    try {
      const p = await this.prisma.traderProfile.upsert({
        where: { userId },
        create: { userId, nickname, leaderboardOptIn: dto.leaderboardOptIn ?? false },
        update: {
          nickname,
          ...(dto.leaderboardOptIn !== undefined && { leaderboardOptIn: dto.leaderboardOptIn }),
        },
      });
      return { nickname: p.nickname, leaderboardOptIn: p.leaderboardOptIn };
    } catch (e) {
      if ((e as { code?: string }).code === 'P2002')
        throw Errors.conflict('NICKNAME_TAKEN', 'This nickname is taken');
      throw e;
    }
  }

  // ------------------------------------------------------------- ranking helpers
  private async liveReturn(accountId: string, initial: bigint) {
    const live = this.state.get(accountId) ?? (await this.state.reload(accountId));
    const equity = live ? this.state.metrics(live).equityMinor : initial;
    const pnl = equity - initial;
    return { pnl, returnBps: initial > 0n ? Number((pnl * 10_000n) / initial) : 0 };
  }

  private async tradesByAccount(ids: string[]) {
    if (!ids.length) return new Map<string, number>();
    const rows = await this.prisma.fill.groupBy({
      by: ['accountId'],
      where: { accountId: { in: ids }, realizedPnlMinor: { not: 0n } },
      _count: { _all: true },
    });
    return new Map(rows.map((r) => [r.accountId, r._count._all]));
  }

  private rank(rows: Omit<RankingRowDto, 'rank'>[]): RankingRowDto[] {
    return rows
      .sort((a, b) => b.returnBps - a.returnBps || b.trades - a.trades)
      .map((r, i) => ({ ...r, rank: i + 1 }));
  }

  // ------------------------------------------------------------- leaderboard
  /** Active funded accounts of traders who opted in (best account per trader), by return. */
  async leaderboard(userId: string): Promise<LeaderboardDto> {
    const accounts = await this.prisma.tradingAccount.findMany({
      where: {
        kind: 'FUNDED',
        status: 'FUNDED_ACTIVE',
        purchaseId: { not: null },
        OR: [{ user: { traderProfile: { leaderboardOptIn: true } } }, { userId }],
      },
      select: {
        id: true,
        userId: true,
        initialBalanceMinor: true,
        user: { select: { traderProfile: true } },
      },
    });
    const trades = await this.tradesByAccount(accounts.map((a) => a.id));
    const best = new Map<string, Omit<RankingRowDto, 'rank'> & { public: boolean }>();
    for (const a of accounts) {
      const r = await this.liveReturn(a.id, a.initialBalanceMinor);
      const profile = a.user.traderProfile;
      const row = {
        name: profile?.nickname ?? anonymousName(a.userId),
        isYou: a.userId === userId,
        returnBps: r.returnBps,
        accountSizeMinor: a.initialBalanceMinor.toString(),
        pnlMinor: r.pnl.toString(),
        trades: trades.get(a.id) ?? 0,
        public: !!profile?.leaderboardOptIn,
      };
      const prev = best.get(a.userId);
      if (!prev || row.returnBps > prev.returnBps) best.set(a.userId, row);
    }
    const all = [...best.values()];
    const publicRows = this.rank(all.filter((r) => r.public).map(({ public: _p, ...r }) => r));
    const mine = all.find((r) => r.isYou);
    const youArePublic = !!mine?.public;
    let you: RankingRowDto | null = null;
    if (mine) {
      const { public: _p, ...row } = mine;
      you = youArePublic
        ? publicRows.find((r) => r.isYou)!
        : { ...row, rank: publicRows.filter((r) => r.returnBps > row.returnBps).length + 1 };
    }
    return {
      rows: publicRows.slice(0, 100),
      you,
      youArePublic,
      updatedAt: new Date().toISOString(),
    };
  }

  // ------------------------------------------------------------- competitions
  /** The monthly competition always exists for the current month (created on first use). */
  async ensureMonthly(now = new Date()): Promise<Competition> {
    const m = amsterdamMonth(now);
    return this.prisma.competition.upsert({
      where: { slug: m.slug },
      create: {
        slug: m.slug,
        name: `Daily Funded Monthly — ${m.label}`,
        startsAt: m.start,
        endsAt: m.end,
        startingBalanceMinor: 10_000_000n,
        prize: null,
      },
      update: {},
    });
  }

  private statusOf(c: Competition, now = Date.now()): CompetitionDto['status'] {
    if (now < c.startsAt.getTime()) return 'UPCOMING';
    return now < c.endsAt.getTime() ? 'RUNNING' : 'ENDED';
  }

  private async toDto(c: Competition, userId: string): Promise<CompetitionDto> {
    const entries = await this.prisma.competitionEntry.findMany({
      where: { competitionId: c.id },
      include: { user: { select: { traderProfile: true } } },
    });
    const trades = await this.tradesByAccount(entries.map((e) => e.accountId));
    const rows: Omit<RankingRowDto, 'rank'>[] = [];
    for (const e of entries) {
      const r = await this.liveReturn(e.accountId, c.startingBalanceMinor);
      rows.push({
        name: e.user.traderProfile?.nickname ?? anonymousName(e.userId),
        isYou: e.userId === userId,
        returnBps: r.returnBps,
        accountSizeMinor: c.startingBalanceMinor.toString(),
        pnlMinor: r.pnl.toString(),
        trades: trades.get(e.accountId) ?? 0,
      });
    }
    const ranked = this.rank(rows);
    const mine = entries.find((e) => e.userId === userId);
    return {
      id: c.id,
      name: c.name,
      startsAt: c.startsAt.toISOString(),
      endsAt: c.endsAt.toISOString(),
      status: this.statusOf(c),
      startingBalanceMinor: c.startingBalanceMinor.toString(),
      maxLeverage: c.maxLeverage,
      prize: c.prize,
      entrants: entries.length,
      yourAccountId: mine?.accountId ?? null,
      standings: ranked.slice(0, 50),
      you: ranked.find((r) => r.isYou) ?? null,
    };
  }

  async competitions(userId: string): Promise<CompetitionDto[]> {
    await this.ensureMonthly();
    const list = await this.prisma.competition.findMany({ orderBy: { startsAt: 'desc' }, take: 6 });
    return Promise.all(list.map((c) => this.toDto(c, userId)));
  }

  /** Join a running competition: opens a dedicated simulated competition account. */
  async join(userId: string, competitionId: string): Promise<CompetitionDto> {
    const c = await this.prisma.competition.findUnique({ where: { id: competitionId } });
    if (!c) throw Errors.notFound('Competition');
    if (this.statusOf(c) === 'ENDED')
      throw Errors.unprocessable('COMPETITION_NOT_ACTIVE', 'The competition has ended');
    const existing = await this.prisma.competitionEntry.findUnique({
      where: { competitionId_userId: { competitionId, userId } },
    });
    if (!existing) {
      const accountId = await this.trading.openCompetitionAccount({
        userId,
        initialBalanceMinor: c.startingBalanceMinor,
        maxLeverage: c.maxLeverage,
        label: c.name.replace('Daily Funded Monthly — ', 'Competition '),
      });
      try {
        await this.prisma.competitionEntry.create({ data: { competitionId, userId, accountId } });
      } catch (e) {
        if ((e as { code?: string }).code !== 'P2002') throw e;
      }
    }
    return this.toDto(c, userId);
  }

  // ------------------------------------------------------------- transparency
  async transparency(): Promise<TransparencyDto> {
    const [traders, funded, active, closed, competitions] = await Promise.all([
      this.prisma.user.count({ where: { status: 'ACTIVE' } }),
      this.prisma.tradingAccount.count({ where: { kind: 'FUNDED', purchaseId: { not: null } } }),
      this.prisma.tradingAccount.count({
        where: { kind: 'FUNDED', purchaseId: { not: null }, status: 'FUNDED_ACTIVE' },
      }),
      this.prisma.tradingAccount.count({
        where: { kind: 'FUNDED', purchaseId: { not: null }, status: { in: ['FAILED', 'CLOSED'] } },
      }),
      this.prisma.competition.count(),
    ]);
    return {
      traders,
      fundedAccounts: funded,
      activeFundedAccounts: active,
      closedFundedAccounts: closed,
      payouts: 0,
      payoutsTotalMinor: '0',
      competitions,
      updatedAt: new Date().toISOString(),
    };
  }
}
