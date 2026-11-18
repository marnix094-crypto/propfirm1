import { describe, expect, it } from 'vitest';
import {
  DAY_MS,
  fundingProgress,
  nextScaledSizeMinor,
  quotePriceMinor,
  traderShareMinor,
  type FundingParams,
  type FundingState,
} from './funding.js';

const P: FundingParams = {
  profitSplitBps: 8_000,
  payoutIntervalDays: 14,
  minTradingDaysPerPayout: 3,
  minPayoutMinor: 5_000n,
  scalingProfitTargetBps: 1_000,
  scalingMinPayouts: 2,
  scalingStepBps: 2_500,
  scalingMaxBalanceMinor: 40_000_000n,
};

const T0 = Date.UTC(2026, 10, 1);
const S: FundingState = {
  initialBalanceMinor: 2_500_000n,
  balanceMinor: 2_500_000n,
  payoutBaselineMinor: 2_500_000n,
  scalingProfitMinor: 0n,
  cycleStartedAtMs: T0,
  nowMs: T0,
  cycleTradingDays: 0,
  payoutsCount: 0,
  hasOpenPositions: false,
};

const cond = (r: ReturnType<typeof fundingProgress>, code: string) =>
  r.payout.conditions.find((c) => c.code === code)!;

describe('traderShareMinor', () => {
  it('is zero for no or negative profit', () => {
    expect(traderShareMinor(0n, 8_000)).toBe(0n);
    expect(traderShareMinor(-500n, 8_000)).toBe(0n);
  });
  it('rounds half-even', () => {
    expect(traderShareMinor(100_000n, 8_000)).toBe(80_000n);
    expect(traderShareMinor(5n, 5_000)).toBe(2n); // 2.5 → 2
    expect(traderShareMinor(7n, 5_000)).toBe(4n); // 3.5 → 4
  });
});

describe('fundingProgress — payout', () => {
  it('a fresh account is not eligible', () => {
    const r = fundingProgress(P, S);
    expect(r.profitMinor).toBe(0n);
    expect(r.traderShareMinor).toBe(0n);
    expect(r.payout.eligible).toBe(false);
    expect(r.payout.eligibleFromMs).toBe(T0 + 14 * DAY_MS);
    expect(cond(r, 'PAYOUT_INTERVAL')).toMatchObject({ met: false, current: 0n, required: 14n });
    expect(cond(r, 'PAYOUT_NO_OPEN_POSITIONS').met).toBe(true);
  });

  it('becomes eligible once every condition is met', () => {
    const r = fundingProgress(P, {
      ...S,
      balanceMinor: 2_600_000n,
      nowMs: T0 + 14 * DAY_MS,
      cycleTradingDays: 3,
    });
    expect(r.profitMinor).toBe(100_000n);
    expect(r.traderShareMinor).toBe(80_000n);
    expect(r.payout.eligible).toBe(true);
  });

  it('each condition blocks on its own', () => {
    const ok = { ...S, balanceMinor: 2_600_000n, nowMs: T0 + 20 * DAY_MS, cycleTradingDays: 5 };
    expect(fundingProgress(P, { ...ok, nowMs: T0 + 14 * DAY_MS - 1 }).payout.eligible).toBe(false);
    expect(fundingProgress(P, { ...ok, cycleTradingDays: 2 }).payout.eligible).toBe(false);
    expect(fundingProgress(P, { ...ok, balanceMinor: 2_506_000n }).payout.eligible).toBe(false); // share 4800 < 5000
    expect(fundingProgress(P, { ...ok, hasOpenPositions: true }).payout.eligible).toBe(false);
    expect(fundingProgress(P, ok).payout.eligible).toBe(true);
  });

  it('never counts a loss as profit', () => {
    const r = fundingProgress(P, { ...S, balanceMinor: 2_400_000n });
    expect(r.profitMinor).toBe(0n);
    expect(cond(r, 'PAYOUT_MIN_AMOUNT').met).toBe(false);
  });

  it('measures profit from the payout baseline', () => {
    const r = fundingProgress(P, {
      ...S,
      balanceMinor: 2_700_000n,
      payoutBaselineMinor: 2_650_000n,
    });
    expect(r.profitMinor).toBe(50_000n);
  });
});

describe('fundingProgress — scaling', () => {
  it('needs both the profit target and the payouts', () => {
    const base = { ...S, scalingProfitMinor: 250_000n };
    expect(fundingProgress(P, base).scaling).toMatchObject({
      targetMinor: 250_000n,
      eligible: false,
      nextSizeMinor: 3_125_000n,
    });
    expect(fundingProgress(P, { ...base, payoutsCount: 2 }).scaling.eligible).toBe(true);
    expect(
      fundingProgress(P, { ...base, payoutsCount: 2, scalingProfitMinor: 249_999n }).scaling
        .eligible,
    ).toBe(false);
  });

  it('caps at the maximum size', () => {
    expect(nextScaledSizeMinor(P, 35_000_000n)).toBe(40_000_000n);
    const r = fundingProgress(P, {
      ...S,
      initialBalanceMinor: 40_000_000n,
      scalingProfitMinor: 10_000_000n,
      payoutsCount: 5,
    });
    expect(r.scaling).toMatchObject({
      atMaximum: true,
      eligible: false,
      nextSizeMinor: 40_000_000n,
    });
  });
});

describe('quotePriceMinor', () => {
  it('matches the example price list formula', () => {
    expect(quotePriceMinor(3_000_000n, 600)).toBe(2_900n + 30n * 600n); // $30K, 6% → €209
    expect(quotePriceMinor(3_000_000n, 400)).toBe(2_900n + 12_000n);
    expect(quotePriceMinor(3_000_000n, 800)).toBe(2_900n + 24_000n);
  });
  it('rejects non-positive sizes', () => {
    expect(() => quotePriceMinor(0n, 600)).toThrow(RangeError);
  });
});
