import { applyBps } from '../money/fixed-point.js';
import { meterState, type MeterState } from './meter.js';

/**
 * Challenge / funded account rules (decision D5: rule sets are immutable and versioned).
 * All amounts are bigint minor units; percentages are basis points.
 */
export interface RuleParams {
  /** Max loss within one trading day (00:00 Europe/Amsterdam). */
  maxDailyLossBps: number;
  /** What the daily-loss percentage is taken of. */
  dailyLossBasis: 'INITIAL_BALANCE' | 'DAY_START';
  /** The level the daily loss is measured from. */
  dailyLossReference: 'DAY_START_BALANCE' | 'DAY_START_EQUITY' | 'MAX_OF_BOTH';
  /** Max overall drawdown. */
  maxDrawdownBps: number;
  drawdownType: 'STATIC' | 'TRAILING';
  /** For TRAILING: follow the equity peak (incl. open PnL) or the closed-balance peak. */
  trailingBasis: 'EQUITY' | 'BALANCE';
  /** For TRAILING: the floor stops rising once it reaches the initial balance. */
  trailingLocksAtInitial: boolean;
  /** Optional profit target (evaluation phases). */
  profitTargetBps: number | null;
  minTradingDays: number;
  /** Meters turn yellow from this share of a limit. */
  warnRatioBps: number;
}

export interface RuleState {
  initialBalanceMinor: bigint;
  balanceMinor: bigint;
  equityMinor: bigint;
  dayStartBalanceMinor: bigint;
  dayStartEquityMinor: bigint;
  /** Peak of the trailing basis since the start (equity or balance). */
  highWaterMarkMinor: bigint;
  tradingDays: number;
}

export type RuleCode = 'DAILY_LOSS' | 'MAX_DRAWDOWN' | 'PROFIT_TARGET' | 'MIN_TRADING_DAYS';

export interface RuleProgress {
  rule: RuleCode;
  /** Loss so far (limits) or progress so far (targets), ≥ 0. */
  usedMinor: bigint;
  /** The allowed loss (limits) or the goal (targets). */
  limitMinor: bigint;
  /** Equity level that breaches the rule (limits only). */
  floorEquityMinor: bigint | null;
  /** For limits: safe/warn/breach. For targets: 'safe' until reached, then 'breach' is never used. */
  state: MeterState;
  reached?: boolean;
}

export interface RuleEvaluation {
  rules: RuleProgress[];
  /** First breached hard limit, if any. */
  breach: RuleCode | null;
  /** All targets (profit + trading days) met and no breach. */
  passed: boolean;
}

const max = (a: bigint, b: bigint) => (a > b ? a : b);
const min = (a: bigint, b: bigint) => (a < b ? a : b);

/** Reference level for the daily loss. */
export function dailyReference(p: RuleParams, s: RuleState): bigint {
  switch (p.dailyLossReference) {
    case 'DAY_START_BALANCE':
      return s.dayStartBalanceMinor;
    case 'DAY_START_EQUITY':
      return s.dayStartEquityMinor;
    case 'MAX_OF_BOTH':
      return max(s.dayStartBalanceMinor, s.dayStartEquityMinor);
  }
}

export function dailyLossLimitMinor(p: RuleParams, s: RuleState): bigint {
  const base =
    p.dailyLossBasis === 'INITIAL_BALANCE' ? s.initialBalanceMinor : dailyReference(p, s);
  return applyBps(base, p.maxDailyLossBps);
}

/** Equity floor for the overall drawdown. */
export function drawdownFloorMinor(p: RuleParams, s: RuleState): bigint {
  const allowance = applyBps(s.initialBalanceMinor, p.maxDrawdownBps);
  const staticFloor = s.initialBalanceMinor - allowance;
  if (p.drawdownType === 'STATIC') return staticFloor;
  const trailing = max(s.highWaterMarkMinor, s.initialBalanceMinor) - allowance;
  const floor = max(staticFloor, trailing);
  return p.trailingLocksAtInitial ? min(floor, s.initialBalanceMinor) : floor;
}

/** New high-water mark after observing the current state (equity- or balance-based). */
export function nextHighWaterMark(p: RuleParams, s: RuleState): bigint {
  const v = p.trailingBasis === 'EQUITY' ? s.equityMinor : s.balanceMinor;
  return max(s.highWaterMarkMinor, v);
}

function limitProgress(
  rule: RuleCode,
  floor: bigint,
  reference: bigint,
  equity: bigint,
  warnRatioBps: number,
): RuleProgress {
  const limit = max(0n, reference - floor);
  const used = max(0n, reference - equity);
  // Breach when equity touches the floor (≤).
  let state: MeterState;
  if (equity <= floor) state = 'breach';
  else {
    const m = meterState(used, limit === 0n ? 1n : limit, warnRatioBps);
    state = m === 'breach' ? 'warn' : m; // not breached until equity reaches the floor
  }
  return { rule, usedMinor: used, limitMinor: limit, floorEquityMinor: floor, state };
}

/**
 * Evaluate all rules for the current state. Pure and deterministic — the API calls this
 * on every tick for accounts with open positions and after every fill.
 */
export function evaluateRules(p: RuleParams, s: RuleState): RuleEvaluation {
  const reference = dailyReference(p, s);
  const dailyFloor = reference - dailyLossLimitMinor(p, s);
  const ddFloor = drawdownFloorMinor(p, s);
  // Drawdown "used" is measured from the level the floor trails (peak, or initial for static).
  const ddReference = ddFloor + applyBps(s.initialBalanceMinor, p.maxDrawdownBps);

  const rules: RuleProgress[] = [
    limitProgress('DAILY_LOSS', dailyFloor, reference, s.equityMinor, p.warnRatioBps),
    limitProgress('MAX_DRAWDOWN', ddFloor, ddReference, s.equityMinor, p.warnRatioBps),
  ];

  let targetsMet = true;
  if (p.profitTargetBps !== null) {
    const goal = applyBps(s.initialBalanceMinor, p.profitTargetBps);
    const profit = max(0n, s.balanceMinor - s.initialBalanceMinor); // closed balance only
    const reached = profit >= goal;
    targetsMet &&= reached;
    rules.push({
      rule: 'PROFIT_TARGET',
      usedMinor: min(profit, goal),
      limitMinor: goal,
      floorEquityMinor: null,
      state: 'safe',
      reached,
    });
  }
  if (p.minTradingDays > 0) {
    const reached = s.tradingDays >= p.minTradingDays;
    targetsMet &&= reached;
    rules.push({
      rule: 'MIN_TRADING_DAYS',
      usedMinor: BigInt(Math.min(s.tradingDays, p.minTradingDays)),
      limitMinor: BigInt(p.minTradingDays),
      floorEquityMinor: null,
      state: 'safe',
      reached,
    });
  }

  const breach = rules.find((r) => r.state === 'breach')?.rule ?? null;
  return {
    rules,
    breach,
    passed: breach === null && targetsMet && (p.profitTargetBps !== null || p.minTradingDays > 0),
  };
}
