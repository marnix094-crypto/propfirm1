import { describe, expect, it } from 'vitest';
import {
  COMPETE_DEFAULTS as P,
  canStart,
  competeFloorMinor,
  isDrawdownBreached,
  prizeBreakdown,
  rankStandings,
  returnBps,
  roundStartMs,
  settleRound,
  validateCompeteParams,
  type CompeteStanding,
} from './compete.js';

const START = 10_000_000n; // $100,000.00
const st = (id: string, equity: bigint, at = 0): CompeteStanding => ({
  entryId: id,
  equityMinor: equity,
  startBalanceMinor: START,
  enteredAtMs: at,
});

describe('compete params', () => {
  it('defaults: $10 entry, $100k, 1:100, 10% drawdown, min 50, 80% pool split 50/30/20, 1 hour', () => {
    expect(P.entryFeeMinor).toBe(1_000n);
    expect(P.startBalanceMinor).toBe(START);
    expect(P.leverage).toBe(100);
    expect(P.maxDrawdownBps).toBe(1_000);
    expect(P.minParticipants).toBe(50);
    expect(P.prizePoolBps).toBe(8_000);
    expect(P.prizeSplitBps).toEqual([5_000, 3_000, 2_000]);
    expect(P.durationMs).toBe(3_600_000);
    expect(validateCompeteParams(P)).toEqual([]);
  });

  it('rejects inconsistent params', () => {
    expect(
      validateCompeteParams({
        ...P,
        entryFeeMinor: 0n,
        prizeSplitBps: [2_000, 3_000, 4_000],
        minParticipants: 2,
        maxDrawdownBps: 10_000,
      }),
    ).toEqual([
      'FEE_NOT_POSITIVE',
      'DRAWDOWN_RANGE',
      'SPLIT_SUM',
      'SPLIT_ORDER',
      'MIN_PARTICIPANTS',
    ]);
  });
});

describe('drawdown', () => {
  it('static floor at $90,000; breached at or below', () => {
    const floor = competeFloorMinor(P);
    expect(floor).toBe(9_000_000n);
    expect(isDrawdownBreached(9_000_001n, floor)).toBe(false);
    expect(isDrawdownBreached(9_000_000n, floor)).toBe(true);
  });
});

describe('ranking', () => {
  it('ranks by return, ties by earlier entry, then id', () => {
    const r = rankStandings([
      st('a', 10_100_000n, 5),
      st('b', 10_500_000n, 9),
      st('c', 10_100_000n, 1),
      st('d', 9_000_000n, 0),
      st('e', 10_100_000n, 1),
    ]);
    expect(r.map((x) => x.entryId)).toEqual(['b', 'c', 'e', 'a', 'd']);
    expect(r.map((x) => x.rank)).toEqual([1, 2, 3, 4, 5]);
    expect(r[0]!.returnBps).toBe(500n);
    expect(r[4]!.returnBps).toBe(-1_000n);
  });

  it('return in bps is half-even rounded', () => {
    expect(returnBps(10_000_500n, START)).toBe(0n); // 0.5 bp → even
    expect(returnBps(10_001_500n, START)).toBe(2n); // 1.5 bp → even
    expect(returnBps(9_998_500n, START)).toBe(-2n);
  });
});

describe('prizes', () => {
  it('80% of the pot, 50/30/20 of that; operator keeps 20%', () => {
    const b = prizeBreakdown(P, 100); // pot $1,000
    expect(b.potMinor).toBe(100_000n);
    expect(b.prizePoolMinor).toBe(80_000n);
    expect(b.prizesMinor).toEqual([40_000n, 24_000n, 16_000n]);
    expect(b.operatorMinor).toBe(20_000n);
  });

  it('rounds prizes down so the pot is never exceeded; remainder to operator', () => {
    const b = prizeBreakdown({ ...P, entryFeeMinor: 333n }, 7); // pot 2331
    expect(b.prizesMinor).toEqual([932n, 559n, 372n]);
    expect(b.prizesMinor.reduce((a, c) => a + c, 0n) + b.operatorMinor).toBe(b.potMinor);
    expect(b.operatorMinor).toBe(468n);
  });
});

describe('settlement', () => {
  it('cancels and refunds every entry below the minimum of 50', () => {
    expect(canStart(P, 49)).toBe(false);
    expect(canStart(P, 50)).toBe(true);
    const out = settleRound(P, [st('a', START), st('b', START)]);
    expect(out.status).toBe('CANCELLED');
    if (out.status === 'CANCELLED')
      expect(out.refunds).toEqual([
        { entryId: 'a', amountMinor: 1_000n },
        { entryId: 'b', amountMinor: 1_000n },
      ]);
  });

  it('pays the top 3 when the round ran', () => {
    const standings = Array.from({ length: 50 }, (_, i) =>
      st(`e${String(i).padStart(2, '0')}`, START + BigInt(i) * 1_000n, i),
    );
    const out = settleRound(P, standings);
    expect(out.status).toBe('SETTLED');
    if (out.status !== 'SETTLED') return;
    expect(out.breakdown.potMinor).toBe(50_000n);
    expect(out.ranking.slice(0, 4).map((r) => [r.entryId, r.prizeMinor])).toEqual([
      ['e49', 20_000n],
      ['e48', 12_000n],
      ['e47', 8_000n],
      ['e46', 0n],
    ]);
  });
});

describe('schedule', () => {
  it('20:00 Europe/Amsterdam in winter (UTC+1) and summer (UTC+2)', () => {
    expect(
      new Date(roundStartMs(Date.UTC(2026, 0, 15, 12), 'Europe/Amsterdam', 20 * 60)).toISOString(),
    ).toBe('2026-01-15T19:00:00.000Z');
    expect(
      new Date(roundStartMs(Date.UTC(2026, 6, 15, 12), 'Europe/Amsterdam', 20 * 60)).toISOString(),
    ).toBe('2026-07-15T18:00:00.000Z');
    // DST switch day (29 March 2026)
    expect(
      new Date(roundStartMs(Date.UTC(2026, 2, 29, 12), 'Europe/Amsterdam', 20 * 60)).toISOString(),
    ).toBe('2026-03-29T18:00:00.000Z');
  });
});
