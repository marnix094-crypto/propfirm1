import { applyBps, divRoundHalfEven } from '../money/fixed-point.js';

/**
 * Funded-account economics (phase 6): profit split, payout eligibility and the scaling plan.
 * Pure and deterministic. Money = bigint minor units, percentages = basis points,
 * timestamps = epoch milliseconds (not money, so `number` is fine).
 */
export interface FundingParams {
  /** Trader share of the profit, e.g. 8000 = 80%. */
  profitSplitBps: number;
  /** Minimum days between the start of a payout cycle and a payout request. */
  payoutIntervalDays: number;
  /** Trading days required within the current payout cycle. */
  minTradingDaysPerPayout: number;
  /** Minimum trader share (USD minor units) for a payout request. */
  minPayoutMinor: bigint;
  /** Scaling: cumulative profit (of the current account size) needed for the next step. */
  scalingProfitTargetBps: number;
  /** Scaling: payouts that must have been made before the next step. */
  scalingMinPayouts: number;
  /** Scaling: size increase per step, e.g. 2500 = +25%. */
  scalingStepBps: number;
  /** Scaling: the account never grows beyond this size. */
  scalingMaxBalanceMinor: bigint;
}

export interface FundingState {
  /** Current account size (grows with scaling). */
  initialBalanceMinor: bigint;
  /** Closed balance. Open PnL never counts towards a payout. */
  balanceMinor: bigint;
  /** Balance level the current payout cycle's profit is measured from. */
  payoutBaselineMinor: bigint;
  /** Profit since the last scaling step, including profit already paid out. */
  scalingProfitMinor: bigint;
  cycleStartedAtMs: number;
  nowMs: number;
  cycleTradingDays: number;
  payoutsCount: number;
  hasOpenPositions: boolean;
}

export type PayoutConditionCode =
  'PAYOUT_INTERVAL' | 'PAYOUT_TRADING_DAYS' | 'PAYOUT_MIN_AMOUNT' | 'PAYOUT_NO_OPEN_POSITIONS';

export interface PayoutCondition {
  code: PayoutConditionCode;
  met: boolean;
  /** Progress values for display; units depend on the code (days, minor units, count). */
  current: bigint;
  required: bigint;
}

export interface FundingProgress {
  profitMinor: bigint;
  traderShareMinor: bigint;
  payout: {
    eligible: boolean;
    eligibleFromMs: number;
    conditions: PayoutCondition[];
  };
  scaling: {
    profitMinor: bigint;
    targetMinor: bigint;
    payouts: number;
    requiredPayouts: number;
    eligible: boolean;
    nextSizeMinor: bigint;
    atMaximum: boolean;
  };
}

export const DAY_MS = 86_400_000;

const max = (a: bigint, b: bigint) => (a > b ? a : b);
const min = (a: bigint, b: bigint) => (a < b ? a : b);

/** Trader share of a (non-negative) profit, rounded by the central half-even rule. */
export function traderShareMinor(profitMinor: bigint, profitSplitBps: number): bigint {
  if (profitMinor <= 0n) return 0n;
  return applyBps(profitMinor, profitSplitBps);
}

/** The size after one scaling step, capped at the maximum. */
export function nextScaledSizeMinor(p: FundingParams, sizeMinor: bigint): bigint {
  return min(
    sizeMinor + applyBps(sizeMinor, p.scalingStepBps),
    max(p.scalingMaxBalanceMinor, sizeMinor),
  );
}

export function fundingProgress(p: FundingParams, s: FundingState): FundingProgress {
  const profitMinor = max(0n, s.balanceMinor - s.payoutBaselineMinor);
  const share = traderShareMinor(profitMinor, p.profitSplitBps);
  const eligibleFromMs = s.cycleStartedAtMs + p.payoutIntervalDays * DAY_MS;
  const elapsedDays = BigInt(Math.max(0, Math.floor((s.nowMs - s.cycleStartedAtMs) / DAY_MS)));

  const conditions: PayoutCondition[] = [
    {
      code: 'PAYOUT_INTERVAL',
      met: s.nowMs >= eligibleFromMs,
      current: elapsedDays,
      required: BigInt(p.payoutIntervalDays),
    },
    {
      code: 'PAYOUT_TRADING_DAYS',
      met: s.cycleTradingDays >= p.minTradingDaysPerPayout,
      current: BigInt(s.cycleTradingDays),
      required: BigInt(p.minTradingDaysPerPayout),
    },
    {
      code: 'PAYOUT_MIN_AMOUNT',
      met: share > 0n && share >= p.minPayoutMinor,
      current: share,
      required: p.minPayoutMinor,
    },
    {
      code: 'PAYOUT_NO_OPEN_POSITIONS',
      met: !s.hasOpenPositions,
      current: s.hasOpenPositions ? 1n : 0n,
      required: 0n,
    },
  ];

  const targetMinor = applyBps(s.initialBalanceMinor, p.scalingProfitTargetBps);
  const atMaximum = s.initialBalanceMinor >= p.scalingMaxBalanceMinor;
  const scalingProfit = max(0n, s.scalingProfitMinor);

  return {
    profitMinor,
    traderShareMinor: share,
    payout: {
      eligible: conditions.every((c) => c.met),
      eligibleFromMs,
      conditions,
    },
    scaling: {
      profitMinor: scalingProfit,
      targetMinor,
      payouts: s.payoutsCount,
      requiredPayouts: p.scalingMinPayouts,
      eligible: !atMaximum && scalingProfit >= targetMinor && s.payoutsCount >= p.scalingMinPayouts,
      nextSizeMinor: atMaximum
        ? s.initialBalanceMinor
        : nextScaledSizeMinor(p, s.initialBalanceMinor),
      atMaximum,
    },
  };
}

/**
 * Price of an instant-funding account (EUR minor units). EXAMPLE formula, used for the
 * custom configurator: €29 base + €6 per $1,000 of size, scaled by the allowed drawdown
 * relative to 6%. Rounded with the central half-even rule.
 */
export function quotePriceMinor(accountSizeMinor: bigint, maxDrawdownBps: number): bigint {
  if (accountSizeMinor <= 0n) throw new RangeError('accountSizeMinor must be positive');
  const base = 2_900n;
  const perThousand = 600n;
  const sizeThousands = accountSizeMinor / 100_000n;
  return base + divRoundHalfEven(sizeThousands * perThousand * BigInt(maxDrawdownBps), 600n);
}
