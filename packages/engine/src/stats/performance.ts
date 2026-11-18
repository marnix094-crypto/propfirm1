import { divRoundHalfEven } from '../money/fixed-point.js';

/**
 * Trading performance statistics (dashboard). Pure: callers pass closed trades and ledger
 * movements with a precomputed trading-day key (YYYY-MM-DD, Europe/Amsterdam).
 * Money = bigint minor units; ratios = basis points.
 */
export interface ClosedTrade {
  /** Realized PnL of the closing fill minus that fill's commission. */
  netPnlMinor: bigint;
  day: string;
}

export interface DayMovement {
  /** Signed balance change from trading: realized PnL, commission, funding. */
  amountMinor: bigint;
  day: string;
}

export interface TradeStats {
  trades: number;
  wins: number;
  losses: number;
  /** Wins / (wins + losses); null without decided trades. */
  winRateBps: number | null;
  grossProfitMinor: bigint;
  grossLossMinor: bigint;
  netPnlMinor: bigint;
  avgWinMinor: bigint | null;
  avgLossMinor: bigint | null;
  /** Gross profit / gross loss; null when there is no loss. */
  profitFactorBps: number | null;
  /** Average net result per trade. */
  expectancyMinor: bigint | null;
  bestTradeMinor: bigint | null;
  worstTradeMinor: bigint | null;
}

export function tradeStats(trades: ClosedTrade[]): TradeStats {
  let wins = 0;
  let losses = 0;
  let grossProfit = 0n;
  let grossLoss = 0n;
  let best: bigint | null = null;
  let worst: bigint | null = null;
  for (const t of trades) {
    const p = t.netPnlMinor;
    if (p > 0n) {
      wins++;
      grossProfit += p;
    } else if (p < 0n) {
      losses++;
      grossLoss += -p;
    }
    if (best === null || p > best) best = p;
    if (worst === null || p < worst) worst = p;
  }
  const decided = wins + losses;
  const net = grossProfit - grossLoss;
  return {
    trades: trades.length,
    wins,
    losses,
    winRateBps: decided ? Number(divRoundHalfEven(BigInt(wins) * 10_000n, BigInt(decided))) : null,
    grossProfitMinor: grossProfit,
    grossLossMinor: grossLoss,
    netPnlMinor: net,
    avgWinMinor: wins ? divRoundHalfEven(grossProfit, BigInt(wins)) : null,
    avgLossMinor: losses ? -divRoundHalfEven(grossLoss, BigInt(losses)) : null,
    profitFactorBps:
      grossLoss > 0n ? Number(divRoundHalfEven(grossProfit * 10_000n, grossLoss)) : null,
    expectancyMinor: trades.length ? divRoundHalfEven(net, BigInt(trades.length)) : null,
    bestTradeMinor: best,
    worstTradeMinor: worst,
  };
}

export interface CalendarDay {
  day: string;
  pnlMinor: bigint;
  trades: number;
}

export interface MonthCalendar {
  /** YYYY-MM */
  month: string;
  days: CalendarDay[];
  netMinor: bigint;
  greenDays: number;
  redDays: number;
  bestDayMinor: bigint | null;
  worstDayMinor: bigint | null;
}

/** Number of days in a month (`YYYY-MM`), Gregorian. */
export function daysInMonth(month: string): number {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) throw new RangeError(`Invalid month: ${month}`);
  const y = Number(m[1]);
  const mo = Number(m[2]);
  if (mo < 1 || mo > 12) throw new RangeError(`Invalid month: ${month}`);
  return new Date(Date.UTC(y, mo, 0)).getUTCDate();
}

/** Every day of the month with its net trading result and number of closed trades. */
export function monthCalendar(
  month: string,
  movements: DayMovement[],
  trades: ClosedTrade[],
): MonthCalendar {
  const n = daysInMonth(month);
  const days: CalendarDay[] = Array.from({ length: n }, (_, i) => ({
    day: `${month}-${String(i + 1).padStart(2, '0')}`,
    pnlMinor: 0n,
    trades: 0,
  }));
  const byDay = new Map(days.map((d) => [d.day, d]));
  for (const m of movements) {
    const d = byDay.get(m.day);
    if (d) d.pnlMinor += m.amountMinor;
  }
  for (const t of trades) {
    const d = byDay.get(t.day);
    if (d) d.trades++;
  }
  let net = 0n;
  let green = 0;
  let red = 0;
  let best: bigint | null = null;
  let worst: bigint | null = null;
  for (const d of days) {
    net += d.pnlMinor;
    const active = d.pnlMinor !== 0n || d.trades > 0;
    if (d.pnlMinor > 0n) green++;
    else if (d.pnlMinor < 0n) red++;
    if (active) {
      if (best === null || d.pnlMinor > best) best = d.pnlMinor;
      if (worst === null || d.pnlMinor < worst) worst = d.pnlMinor;
    }
  }
  return {
    month,
    days,
    netMinor: net,
    greenDays: green,
    redDays: red,
    bestDayMinor: best,
    worstDayMinor: worst,
  };
}

/** Trade statistics per group (e.g. per symbol or per direction), largest groups first. */
export function tradeStatsBy<T extends ClosedTrade>(
  trades: T[],
  key: (t: T) => string,
): { key: string; stats: TradeStats }[] {
  const groups = new Map<string, T[]>();
  for (const t of trades) {
    const k = key(t);
    const list = groups.get(k);
    if (list) list.push(t);
    else groups.set(k, [t]);
  }
  return [...groups.entries()]
    .map(([k, list]) => ({ key: k, stats: tradeStats(list) }))
    .sort((a, b) => b.stats.trades - a.stats.trades || a.key.localeCompare(b.key));
}
