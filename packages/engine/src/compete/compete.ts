import { applyBps, divRoundHalfEven } from '../money/fixed-point.js';

/**
 * Daily trading competition (separate white-label product "Compete", D97–D101).
 * Pure and deterministic. Money = bigint minor units (USD cents), percentages = bps,
 * timestamps = epoch ms.
 */
export interface CompeteParams {
  /** Entry fee per entry (real money once a licensed payment provider exists). */
  entryFeeMinor: bigint;
  /** Virtual starting balance of every entry. */
  startBalanceMinor: bigint;
  leverage: number;
  /** Static max drawdown from the starting balance, e.g. 1000 = 10%. */
  maxDrawdownBps: number;
  /** A round only starts with at least this many paid entries; otherwise all are refunded. */
  minParticipants: number;
  /** Share of the pot paid out as prizes, e.g. 8000 = 80%. The rest goes to the operator. */
  prizePoolBps: number;
  /** Split of the prize pool per place (sums to 10000), e.g. [5000, 3000, 2000]. */
  prizeSplitBps: readonly number[];
  /** Round length. */
  durationMs: number;
}

export const COMPETE_DEFAULTS: CompeteParams = {
  entryFeeMinor: 1_000n,
  startBalanceMinor: 10_000_000n,
  leverage: 100,
  maxDrawdownBps: 1_000,
  minParticipants: 50,
  prizePoolBps: 8_000,
  prizeSplitBps: [5_000, 3_000, 2_000],
  durationMs: 3_600_000,
};

export type CompeteParamsError =
  | 'FEE_NOT_POSITIVE'
  | 'BALANCE_NOT_POSITIVE'
  | 'LEVERAGE_RANGE'
  | 'DRAWDOWN_RANGE'
  | 'POOL_RANGE'
  | 'SPLIT_SUM'
  | 'SPLIT_ORDER'
  | 'MIN_PARTICIPANTS'
  | 'DURATION_RANGE';

/** Returns every violated constraint; empty = valid. */
export function validateCompeteParams(p: CompeteParams): CompeteParamsError[] {
  const errors: CompeteParamsError[] = [];
  if (p.entryFeeMinor <= 0n) errors.push('FEE_NOT_POSITIVE');
  if (p.startBalanceMinor <= 0n) errors.push('BALANCE_NOT_POSITIVE');
  if (!Number.isInteger(p.leverage) || p.leverage < 1 || p.leverage > 500)
    errors.push('LEVERAGE_RANGE');
  if (!Number.isInteger(p.maxDrawdownBps) || p.maxDrawdownBps < 1 || p.maxDrawdownBps >= 10_000)
    errors.push('DRAWDOWN_RANGE');
  if (!Number.isInteger(p.prizePoolBps) || p.prizePoolBps < 0 || p.prizePoolBps > 10_000)
    errors.push('POOL_RANGE');
  const split = p.prizeSplitBps;
  if (
    split.length === 0 ||
    split.some((s) => !Number.isInteger(s) || s <= 0) ||
    split.reduce((a, b) => a + b, 0) !== 10_000
  )
    errors.push('SPLIT_SUM');
  if (split.some((s, i) => i > 0 && s > split[i - 1]!)) errors.push('SPLIT_ORDER');
  if (!Number.isInteger(p.minParticipants) || p.minParticipants < split.length)
    errors.push('MIN_PARTICIPANTS');
  if (!Number.isInteger(p.durationMs) || p.durationMs < 60_000 || p.durationMs > 86_400_000)
    errors.push('DURATION_RANGE');
  return errors;
}

/** Equity at or below this level ends the entry (static, from the starting balance). */
export function competeFloorMinor(
  p: Pick<CompeteParams, 'startBalanceMinor' | 'maxDrawdownBps'>,
): bigint {
  return p.startBalanceMinor - applyBps(p.startBalanceMinor, p.maxDrawdownBps);
}

export function isDrawdownBreached(equityMinor: bigint, floorMinor: bigint): boolean {
  return equityMinor <= floorMinor;
}

/** Return on the starting balance in bps, half-even rounded (display; ranking uses exact equity). */
export function returnBps(equityMinor: bigint, startBalanceMinor: bigint): bigint {
  if (startBalanceMinor <= 0n) throw new RangeError('Start balance must be positive');
  return divRoundHalfEven((equityMinor - startBalanceMinor) * 10_000n, startBalanceMinor);
}

export interface CompeteStanding {
  entryId: string;
  /** Equity (closed balance + open PnL); final equity after settlement. */
  equityMinor: bigint;
  startBalanceMinor: bigint;
  /** Entry (payment) time; earlier entry wins a tie. */
  enteredAtMs: number;
}

export interface RankedStanding extends CompeteStanding {
  rank: number;
  returnBps: bigint;
}

/**
 * Ranking by return on the starting balance (exact, cross-multiplied), ties by earlier entry,
 * then by entryId for full determinism.
 */
export function rankStandings(standings: readonly CompeteStanding[]): RankedStanding[] {
  const sorted = [...standings].sort((a, b) => {
    const left = b.equityMinor * a.startBalanceMinor;
    const right = a.equityMinor * b.startBalanceMinor;
    if (left !== right) return left > right ? 1 : -1;
    if (a.enteredAtMs !== b.enteredAtMs) return a.enteredAtMs - b.enteredAtMs;
    return a.entryId < b.entryId ? -1 : a.entryId > b.entryId ? 1 : 0;
  });
  return sorted.map((s, i) => ({
    ...s,
    rank: i + 1,
    returnBps: returnBps(s.equityMinor, s.startBalanceMinor),
  }));
}

export interface PrizeBreakdown {
  potMinor: bigint;
  prizePoolMinor: bigint;
  /** Prize per place (index 0 = 1st). */
  prizesMinor: bigint[];
  /** Operator share: pot minus all prizes (includes rounding remainders). */
  operatorMinor: bigint;
}

/**
 * Prize amounts are rounded DOWN to whole cents (documented exception to half-even, D100):
 * the paid-out total can then never exceed the pot; remainders go to the operator.
 */
export function prizeBreakdown(
  p: Pick<CompeteParams, 'entryFeeMinor' | 'prizePoolBps' | 'prizeSplitBps'>,
  entries: number,
): PrizeBreakdown {
  if (!Number.isInteger(entries) || entries < 0) throw new RangeError('Invalid entry count');
  const potMinor = p.entryFeeMinor * BigInt(entries);
  const prizePoolMinor = (potMinor * BigInt(p.prizePoolBps)) / 10_000n;
  const places = Math.min(entries, p.prizeSplitBps.length);
  const prizesMinor = p.prizeSplitBps
    .slice(0, places)
    .map((bps) => (potMinor * BigInt(p.prizePoolBps) * BigInt(bps)) / 100_000_000n);
  const paid = prizesMinor.reduce((a, b) => a + b, 0n);
  return { potMinor, prizePoolMinor, prizesMinor, operatorMinor: potMinor - paid };
}

export type SettlementOutcome =
  | {
      status: 'CANCELLED';
      reason: 'MIN_PARTICIPANTS';
      refunds: { entryId: string; amountMinor: bigint }[];
    }
  | {
      status: 'SETTLED';
      ranking: (RankedStanding & { prizeMinor: bigint })[];
      breakdown: PrizeBreakdown;
    };

/** Whether a round with this many paid entries may start. */
export function canStart(p: Pick<CompeteParams, 'minParticipants'>, entries: number): boolean {
  return entries >= p.minParticipants;
}

/** Final settlement: cancel + full refunds below the minimum, otherwise rank and pay the top places. */
export function settleRound(
  p: CompeteParams,
  standings: readonly CompeteStanding[],
): SettlementOutcome {
  if (!canStart(p, standings.length)) {
    return {
      status: 'CANCELLED',
      reason: 'MIN_PARTICIPANTS',
      refunds: standings.map((s) => ({ entryId: s.entryId, amountMinor: p.entryFeeMinor })),
    };
  }
  const breakdown = prizeBreakdown(p, standings.length);
  const ranking = rankStandings(standings).map((r, i) => ({
    ...r,
    prizeMinor: breakdown.prizesMinor[i] ?? 0n,
  }));
  return { status: 'SETTLED', ranking, breakdown };
}

/**
 * Round start for a day: the given local wall-clock time in an IANA zone (e.g. 20:00
 * Europe/Amsterdam), DST-safe. `dayUtcMs` is any instant on the intended local date.
 */
export function roundStartMs(dayUtcMs: number, timeZone: string, startMinuteOfDay: number): number {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const [y, m, d] = fmt.format(new Date(dayUtcMs)).split('-').map(Number) as [
    number,
    number,
    number,
  ];
  const naiveUtc = Date.UTC(y, m - 1, d, Math.floor(startMinuteOfDay / 60), startMinuteOfDay % 60);
  // Offset of the zone at (approximately) that instant; re-evaluate once for DST edges.
  const offsetAt = (ms: number) => {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    }).formatToParts(new Date(ms));
    const get = (t: string) => Number(parts.find((x) => x.type === t)!.value);
    const asUtc = Date.UTC(
      get('year'),
      get('month') - 1,
      get('day'),
      get('hour'),
      get('minute'),
      get('second'),
    );
    return asUtc - Math.floor(ms / 1000) * 1000;
  };
  let guess = naiveUtc - offsetAt(naiveUtc);
  guess = naiveUtc - offsetAt(guess);
  return guess;
}
