import type { RuleSet } from '../../generated/prisma/client.js';

type RuleSetDefinition = Omit<RuleSet, 'id' | 'createdAt'>;

/**
 * Rule set catalogue. Rows are IMMUTABLE once created (DB trigger): to change rules,
 * add a new version — existing accounts keep the version they were opened with (D5).
 *
 * EXAMPLE values only, matching the example pricing — to be replaced by the real offer.
 */
export const RULE_SET_CATALOG: RuleSetDefinition[] = [
  {
    code: 'INSTANT_EXAMPLE',
    version: 1,
    name: 'Instant funding (example rules)',
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
  },
];
