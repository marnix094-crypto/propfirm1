import type { RuleSet } from '../../generated/prisma/client.js';

type RuleSetDefinition = Omit<RuleSet, 'id' | 'createdAt'>;

/**
 * Rule set catalogue. Rows are IMMUTABLE once created (DB trigger): to change rules,
 * add a new version — existing accounts keep the version they were opened with (D5).
 *
 * EXAMPLE values only, matching the example pricing — to be replaced by the real offer.
 */
const NO_FUNDING = {
  payoutIntervalDays: null,
  minTradingDaysPerPayout: null,
  minPayoutMinor: null,
  scalingProfitTargetBps: null,
  scalingMinPayouts: null,
  scalingStepBps: null,
  scalingMaxBalanceMinor: null,
} satisfies Partial<RuleSetDefinition>;

const INSTANT_BASE = {
  maxDailyLossBps: 300,
  dailyLossBasis: 'INITIAL_BALANCE',
  dailyLossReference: 'MAX_OF_BOTH',
  maxDrawdownBps: 600,
  drawdownType: 'TRAILING',
  trailingBasis: 'EQUITY',
  trailingLocksAtInitial: true,
  profitTargetBps: null,
  minTradingDays: 0,
  maxLeverage: 50,
  profitSplitBps: 8000,
  warnRatioBps: 7000,
  isExample: true,
} satisfies Partial<RuleSetDefinition>;

/** Example payout & scaling terms (D51): payout every 14 days after ≥ 3 trading days, min $50. */
const EXAMPLE_FUNDING = {
  payoutIntervalDays: 14,
  minTradingDaysPerPayout: 3,
  minPayoutMinor: 5_000n,
  scalingProfitTargetBps: 1_000,
  scalingMinPayouts: 2,
  scalingStepBps: 2_500,
  scalingMaxBalanceMinor: 40_000_000n,
} satisfies Partial<RuleSetDefinition>;

export const RULE_SET_CATALOG: RuleSetDefinition[] = [
  {
    code: 'INSTANT_EXAMPLE',
    version: 1,
    name: 'Instant funding (example rules)',
    ...INSTANT_BASE,
    ...NO_FUNDING,
  },
  {
    code: 'INSTANT_EXAMPLE',
    version: 2,
    name: 'Instant funding (example rules, payouts & scaling)',
    ...INSTANT_BASE,
    ...EXAMPLE_FUNDING,
  },
  {
    code: 'INSTANT_EXAMPLE_DD400',
    version: 1,
    name: 'Instant funding, 4% drawdown (example rules)',
    ...INSTANT_BASE,
    maxDrawdownBps: 400,
    ...EXAMPLE_FUNDING,
  },
  {
    code: 'INSTANT_EXAMPLE_DD800',
    version: 1,
    name: 'Instant funding, 8% drawdown (example rules)',
    ...INSTANT_BASE,
    maxDrawdownBps: 800,
    ...EXAMPLE_FUNDING,
  },
];

/** Rule set code for an instant account with the given max drawdown (configurator options). */
export const INSTANT_RULE_CODE_BY_DRAWDOWN: Record<number, string> = {
  400: 'INSTANT_EXAMPLE_DD400',
  600: 'INSTANT_EXAMPLE',
  800: 'INSTANT_EXAMPLE_DD800',
};
