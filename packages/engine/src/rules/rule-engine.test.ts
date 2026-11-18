import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  dailyLossLimitMinor,
  drawdownFloorMinor,
  evaluateRules,
  nextHighWaterMark,
  type RuleParams,
  type RuleState,
} from './rule-engine.js';

const $ = (dollars: number) => BigInt(Math.round(dollars * 100));

const params = (o: Partial<RuleParams> = {}): RuleParams => ({
  maxDailyLossBps: 300,
  dailyLossBasis: 'INITIAL_BALANCE',
  dailyLossReference: 'MAX_OF_BOTH',
  maxDrawdownBps: 600,
  drawdownType: 'TRAILING',
  trailingBasis: 'EQUITY',
  trailingLocksAtInitial: true,
  profitTargetBps: null,
  minTradingDays: 0,
  warnRatioBps: 7000,
  ...o,
});

const state = (o: Partial<RuleState> = {}): RuleState => ({
  initialBalanceMinor: $(100_000),
  balanceMinor: $(100_000),
  equityMinor: $(100_000),
  dayStartBalanceMinor: $(100_000),
  dayStartEquityMinor: $(100_000),
  highWaterMarkMinor: $(100_000),
  tradingDays: 0,
  ...o,
});

const rule = (e: ReturnType<typeof evaluateRules>, code: string) =>
  e.rules.find((r) => r.rule === code)!;

describe('max drawdown', () => {
  it('static: floor = initial − x%, breach exactly at the floor', () => {
    const p = params({ drawdownType: 'STATIC', maxDrawdownBps: 1000 });
    expect(drawdownFloorMinor(p, state())).toBe($(90_000));
    const dd = (equity: bigint) =>
      rule(evaluateRules(p, state({ equityMinor: equity })), 'MAX_DRAWDOWN').state;
    expect(dd($(90_000.01))).toBe('warn');
    expect(dd($(90_000))).toBe('breach');
  });

  it('static floor ignores new highs', () => {
    const p = params({ drawdownType: 'STATIC' });
    expect(drawdownFloorMinor(p, state({ highWaterMarkMinor: $(120_000) }))).toBe($(94_000));
  });

  it('trailing: floor follows the peak by the allowance', () => {
    const p = params({ trailingLocksAtInitial: false });
    expect(drawdownFloorMinor(p, state({ highWaterMarkMinor: $(103_000) }))).toBe($(97_000));
    expect(drawdownFloorMinor(p, state({ highWaterMarkMinor: $(108_000) }))).toBe($(102_000));
  });

  it('trailing with lock stops at the initial balance', () => {
    const p = params();
    expect(drawdownFloorMinor(p, state({ highWaterMarkMinor: $(103_000) }))).toBe($(97_000));
    expect(drawdownFloorMinor(p, state({ highWaterMarkMinor: $(108_000) }))).toBe($(100_000));
  });

  it('trailing floor never below the static floor', () => {
    expect(drawdownFloorMinor(params(), state({ highWaterMarkMinor: $(50_000) }))).toBe($(94_000));
  });

  it('high-water mark follows equity or closed balance', () => {
    const s = state({
      equityMinor: $(104_000),
      balanceMinor: $(101_000),
      highWaterMarkMinor: $(102_000),
    });
    expect(nextHighWaterMark(params({ trailingBasis: 'EQUITY' }), s)).toBe($(104_000));
    expect(nextHighWaterMark(params({ trailingBasis: 'BALANCE' }), s)).toBe($(102_000));
  });
});

describe('daily loss', () => {
  it('3% of initial from the higher of day-start balance/equity', () => {
    const s = state({ dayStartBalanceMinor: $(100_000), dayStartEquityMinor: $(101_000) });
    expect(dailyLossLimitMinor(params(), s)).toBe($(3_000));
    const d = rule(evaluateRules(params(), { ...s, equityMinor: $(98_000.01) }), 'DAILY_LOSS');
    expect(d.floorEquityMinor).toBe($(98_000));
    expect(d.state).toBe('warn');
    expect(evaluateRules(params(), { ...s, equityMinor: $(98_000) }).breach).toBe('DAILY_LOSS');
  });

  it('DAY_START basis takes the percentage of the reference', () => {
    const p = params({ dailyLossBasis: 'DAY_START', dailyLossReference: 'DAY_START_BALANCE' });
    expect(dailyLossLimitMinor(p, state({ dayStartBalanceMinor: $(110_000) }))).toBe($(3_300));
  });

  it('meters: blue below 70%, yellow from 70%, red only when breached', () => {
    const p = params({ drawdownType: 'STATIC', maxDrawdownBps: 5000 }); // keep drawdown out of the way
    const at = (loss: number) =>
      rule(evaluateRules(p, state({ equityMinor: $(100_000 - loss) })), 'DAILY_LOSS');
    expect(at(2_000).state).toBe('safe'); // 66%
    expect(at(2_100).state).toBe('warn'); // 70%
    expect(at(2_999.99).state).toBe('warn');
    expect(at(3_000).state).toBe('breach');
    expect(at(2_100).usedMinor).toBe($(2_100));
    expect(at(2_100).limitMinor).toBe($(3_000));
  });

  it('gains do not count as usage', () => {
    expect(
      rule(evaluateRules(params(), state({ equityMinor: $(105_000) })), 'DAILY_LOSS').usedMinor,
    ).toBe(0n);
  });
});

describe('targets and pass', () => {
  const p = params({ profitTargetBps: 800, minTradingDays: 3 });

  it('needs both profit target (closed balance) and trading days', () => {
    expect(
      evaluateRules(
        p,
        state({
          balanceMinor: $(108_000),
          equityMinor: $(108_000),
          highWaterMarkMinor: $(108_000),
          tradingDays: 2,
        }),
      ).passed,
    ).toBe(false);
    expect(
      evaluateRules(
        p,
        state({
          balanceMinor: $(107_000),
          equityMinor: $(109_000),
          highWaterMarkMinor: $(109_000),
          tradingDays: 3,
        }),
      ).passed,
    ).toBe(false);
    const ok = evaluateRules(
      p,
      state({
        balanceMinor: $(108_000),
        equityMinor: $(108_000),
        highWaterMarkMinor: $(108_000),
        dayStartBalanceMinor: $(108_000),
        dayStartEquityMinor: $(108_000),
        tradingDays: 3,
      }),
    );
    expect(ok.passed).toBe(true);
    expect(rule(ok, 'PROFIT_TARGET').reached).toBe(true);
  });

  it('a breach always prevents a pass', () => {
    const e = evaluateRules(
      p,
      state({ balanceMinor: $(108_000), equityMinor: $(90_000), tradingDays: 5 }),
    );
    expect(e.breach).not.toBeNull();
    expect(e.passed).toBe(false);
  });

  it('funded accounts without targets never "pass"', () => {
    expect(evaluateRules(params(), state()).passed).toBe(false);
  });
});

describe('properties', () => {
  const money = fc.bigInt({ min: 1_000_000n, max: 100_000_000n });

  it('trailing floor is non-decreasing in the high-water mark and capped at initial when locked', () => {
    fc.assert(
      fc.property(
        money,
        fc.bigInt({ min: 0n, max: 50_000_000n }),
        fc.bigInt({ min: 0n, max: 50_000_000n }),
        (initial, a, b) => {
          const p = params();
          const lo = a < b ? a : b;
          const hi = a < b ? b : a;
          const f1 = drawdownFloorMinor(
            p,
            state({ initialBalanceMinor: initial, highWaterMarkMinor: initial + lo }),
          );
          const f2 = drawdownFloorMinor(
            p,
            state({ initialBalanceMinor: initial, highWaterMarkMinor: initial + hi }),
          );
          return f1 <= f2 && f2 <= initial;
        },
      ),
    );
  });

  it('breach ⇔ equity at or below one of the floors', () => {
    fc.assert(
      fc.property(fc.bigInt({ min: 5_000_000n, max: 15_000_000n }), (equity) => {
        const p = params();
        const s = state({
          initialBalanceMinor: 10_000_000n,
          dayStartBalanceMinor: 10_000_000n,
          dayStartEquityMinor: 10_000_000n,
          highWaterMarkMinor: 10_000_000n,
          equityMinor: equity,
        });
        const e = evaluateRules(p, s);
        const floors = e.rules
          .filter((r) => r.floorEquityMinor !== null)
          .map((r) => r.floorEquityMinor!);
        return (e.breach !== null) === floors.some((f) => equity <= f);
      }),
    );
  });
});
