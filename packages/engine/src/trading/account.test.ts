import { describe, expect, it } from 'vitest';
import { BTC, p, quote } from './fixtures.js';
import { accountMetrics, isStopOut, validateOrder, type ValidationContext } from './account.js';
import { fundingPaymentMinor } from './funding.js';
import type { OrderRequest, PositionState } from './types.js';

const q = quote('60000.0', '60000.1');
const ctx = (overrides: Partial<ValidationContext> = {}): ValidationContext => ({
  spec: BTC,
  quote: q,
  position: null,
  metrics: accountMetrics(10_000_000n, []), // $100,000
  accountMaxLeverage: 50,
  ...overrides,
});
const market = (o: Partial<OrderRequest> = {}): OrderRequest => ({
  side: 'BUY',
  type: 'MARKET',
  qty: 100n,
  leverage: 10,
  ...o,
});
const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return (e as { code?: string }).code;
  }
  return 'OK';
};

describe('accountMetrics', () => {
  it('computes equity, used/free margin and margin level', () => {
    const pos: PositionState = {
      side: 'LONG',
      qty: 1000n,
      avgEntryPrice: p('59000.0'),
      leverage: 10,
    };
    const m = accountMetrics(10_000_000n, [{ position: pos, spec: BTC, quote: q }]);
    expect(m.unrealizedPnlMinor).toBe(100_000n);
    expect(m.equityMinor).toBe(10_100_000n);
    expect(m.usedMarginMinor).toBe(590_000n);
    expect(m.freeMarginMinor).toBe(9_510_000n);
    expect(m.marginLevelBps).toBe(171_186n);
    expect(isStopOut(m, 5_000)).toBe(false);
  });

  it('flags stop-out at or below the level', () => {
    const pos: PositionState = {
      side: 'LONG',
      qty: 1000n,
      avgEntryPrice: p('60000.0'),
      leverage: 50,
    };
    const crash = quote('50000.0', '50000.1');
    const m = accountMetrics(1_000_000n, [{ position: pos, spec: BTC, quote: crash }]); // $10k balance, -$10k
    expect(isStopOut(m, 5_000)).toBe(true);
  });
});

describe('validateOrder', () => {
  it('accepts a valid market order and reports opening qty', () => {
    expect(validateOrder(market(), ctx())).toEqual({ openingQty: 100n });
  });

  it.each([
    [market({ qty: 0n }), 'INVALID_QTY'],
    [market({ leverage: 0 }), 'LEVERAGE_INVALID'],
    [market({ leverage: 51 }), 'LEVERAGE_INVALID'], // account cap 50
    [market({ type: 'LIMIT' }), 'LIMIT_PRICE_REQUIRED'],
    [market({ type: 'STOP' }), 'STOP_PRICE_REQUIRED'],
    [market({ type: 'STOP', stopPrice: p('59000.0') }), 'STOP_PRICE_INVALID'], // buy stop below market
    [market({ reduceOnly: true }), 'REDUCE_ONLY_NO_POSITION'],
    [market({ qty: 100_000n, leverage: 1 }), 'INSUFFICIENT_MARGIN'], // $6M notional on $100k
  ])('%o → %s', (order, expected) => {
    expect(code(() => validateOrder(order, ctx()))).toBe(expected);
  });

  it('checks qty step and min qty from the instrument', () => {
    const spec = { ...BTC, minQty: 10n, qtyStep: 5n };
    expect(code(() => validateOrder(market({ qty: 5n }), ctx({ spec })))).toBe('QTY_BELOW_MIN');
    expect(code(() => validateOrder(market({ qty: 12n }), ctx({ spec })))).toBe('QTY_STEP');
  });

  it('rejects a limit price off the tick grid', () => {
    const spec = { ...BTC, tickSize: 10n };
    expect(
      code(() => validateOrder(market({ type: 'LIMIT', limitPrice: 599_995n }), ctx({ spec }))),
    ).toBe('PRICE_TICK');
  });

  it('netting: increasing requires the same leverage; reducing needs no margin', () => {
    const position: PositionState = {
      side: 'LONG',
      qty: 1000n,
      avgEntryPrice: p('60000.0'),
      leverage: 10,
    };
    expect(code(() => validateOrder(market({ leverage: 20 }), ctx({ position })))).toBe(
      'LEVERAGE_MISMATCH',
    );
    const broke = accountMetrics(0n, []);
    expect(
      validateOrder(
        market({ side: 'SELL', qty: 500n, reduceOnly: true }),
        ctx({ position, metrics: broke }),
      ),
    ).toEqual({
      openingQty: 0n,
    });
    expect(
      code(() =>
        validateOrder(market({ side: 'SELL', qty: 1500n, reduceOnly: true }), ctx({ position })),
      ),
    ).toBe('REDUCE_ONLY_WOULD_INCREASE');
  });
});

describe('funding', () => {
  const pos: PositionState = {
    side: 'LONG',
    qty: 1000n,
    avgEntryPrice: p('60000.0'),
    leverage: 10,
  };
  it('longs pay a positive rate, shorts receive it', () => {
    const rate = 10_000n; // 0.0001 = 0.01%
    expect(fundingPaymentMinor(pos, p('60000.0'), rate, BTC)).toBe(-600n); // $6.00 on $60k
    expect(fundingPaymentMinor({ ...pos, side: 'SHORT' }, p('60000.0'), rate, BTC)).toBe(600n);
  });
});
