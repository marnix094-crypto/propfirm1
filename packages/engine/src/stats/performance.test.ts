import { describe, expect, it } from 'vitest';
import { daysInMonth, monthCalendar, tradeStats, tradeStatsBy } from './performance.js';

const t = (netPnlMinor: bigint, day = '2026-11-03') => ({ netPnlMinor, day });

describe('tradeStats', () => {
  it('is empty without trades', () => {
    expect(tradeStats([])).toMatchObject({
      trades: 0,
      winRateBps: null,
      profitFactorBps: null,
      expectancyMinor: null,
      bestTradeMinor: null,
    });
  });

  it('computes win rate, averages, profit factor and extremes', () => {
    const s = tradeStats([t(10_000n), t(5_000n), t(-4_000n), t(0n), t(-1_000n)]);
    expect(s).toMatchObject({
      trades: 5,
      wins: 2,
      losses: 2,
      winRateBps: 5_000,
      grossProfitMinor: 15_000n,
      grossLossMinor: 5_000n,
      netPnlMinor: 10_000n,
      avgWinMinor: 7_500n,
      avgLossMinor: -2_500n,
      profitFactorBps: 30_000,
      expectancyMinor: 2_000n,
      bestTradeMinor: 10_000n,
      worstTradeMinor: -4_000n,
    });
  });

  it('rounds the win rate half-even and has no profit factor without losses', () => {
    const s = tradeStats([t(1n), t(1n), t(-1n)]);
    expect(s.winRateBps).toBe(6_667);
    expect(tradeStats([t(5n)]).profitFactorBps).toBeNull();
  });
});

describe('monthCalendar', () => {
  it('lists every day of the month, including leap February', () => {
    expect(daysInMonth('2026-11')).toBe(30);
    expect(daysInMonth('2028-02')).toBe(29);
    expect(() => daysInMonth('2026-13')).toThrow(RangeError);
    expect(monthCalendar('2026-02', [], []).days).toHaveLength(28);
  });

  it('sums movements per day and ignores other months', () => {
    const c = monthCalendar(
      '2026-11',
      [
        { day: '2026-11-03', amountMinor: 12_000n },
        { day: '2026-11-03', amountMinor: -500n },
        { day: '2026-11-04', amountMinor: -3_000n },
        { day: '2026-10-31', amountMinor: 99_999n },
      ],
      [t(12_000n, '2026-11-03'), t(-3_000n, '2026-11-04'), t(1n, '2026-12-01')],
    );
    expect(c.days[2]).toEqual({ day: '2026-11-03', pnlMinor: 11_500n, trades: 1 });
    expect(c.days[3]).toEqual({ day: '2026-11-04', pnlMinor: -3_000n, trades: 1 });
    expect(c).toMatchObject({
      netMinor: 8_500n,
      greenDays: 1,
      redDays: 1,
      bestDayMinor: 11_500n,
      worstDayMinor: -3_000n,
    });
  });

  it('has no best/worst day without activity', () => {
    expect(monthCalendar('2026-11', [], [])).toMatchObject({
      bestDayMinor: null,
      worstDayMinor: null,
    });
  });
});

describe('tradeStatsBy', () => {
  it('groups trades and orders by size', () => {
    const trades = [
      { netPnlMinor: 5n, day: '2026-11-03', symbol: 'ETH' },
      { netPnlMinor: -2n, day: '2026-11-03', symbol: 'BTC' },
      { netPnlMinor: 3n, day: '2026-11-04', symbol: 'BTC' },
    ];
    const g = tradeStatsBy(trades, (t) => t.symbol);
    expect(g.map((x) => x.key)).toEqual(['BTC', 'ETH']);
    expect(g[0]!.stats).toMatchObject({ trades: 2, wins: 1, losses: 1, netPnlMinor: 1n });
  });
});
