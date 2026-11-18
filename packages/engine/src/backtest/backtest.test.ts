import { describe, expect, it } from 'vitest';
import type { InstrumentSpec } from '../trading/types.js';
import { backtestEquity, closeBacktest, newBacktest, openBacktest } from './backtest.js';

const BTC: InstrumentSpec = {
  symbol: 'BTCUSDT',
  priceDecimals: 1,
  qtyDecimals: 3,
  tickSize: 1n,
  minQty: 1n,
  qtyStep: 1n,
  maxLeverage: 100,
  spreadMarkupBps: 0,
  commissionBps: 4,
  slippageBaseBps: 0,
  slippageImpactBpsPer100k: 0,
  slippageMaxBps: 0,
};
const D = '2026-11-18';

describe('backtest', () => {
  it('opens, marks and closes a long with commissions', () => {
    let s = newBacktest(1_000_000n); // $10,000
    s = openBacktest(s, 'LONG', 100n, 600_000n, 1, D, BTC); // 0.100 BTC @ 60,000.0
    expect(s.balanceMinor).toBe(1_000_000n - 240n); // 4 bps of $6,000
    expect(backtestEquity(s, 610_000n, BTC)).toBe(1_000_000n - 240n + 10_000n);
    s = closeBacktest(s, 610_000n, 2, D, BTC);
    expect(s.position).toBeNull();
    expect(s.trades[0]).toMatchObject({ side: 'LONG', netPnlMinor: 10_000n - 244n });
    expect(s.balanceMinor).toBe(1_000_000n - 240n + 10_000n - 244n);
  });

  it('reverses: an opposite order closes first', () => {
    let s = newBacktest(1_000_000n);
    s = openBacktest(s, 'SHORT', 100n, 600_000n, 1, D, BTC);
    s = openBacktest(s, 'LONG', 100n, 590_000n, 2, D, BTC);
    expect(s.trades).toHaveLength(1);
    expect(s.trades[0]!.netPnlMinor).toBe(10_000n - 236n);
    expect(s.position).toMatchObject({ side: 'LONG', qty: 100n, entryPrice: 590_000n });
  });

  it('adds to a position at the average price and rejects bad sizes', () => {
    let s = newBacktest(1_000_000n);
    s = openBacktest(s, 'LONG', 100n, 600_000n, 1, D, BTC);
    s = openBacktest(s, 'LONG', 100n, 620_000n, 2, D, BTC);
    expect(s.position).toMatchObject({ qty: 200n, entryPrice: 610_000n });
    expect(() => openBacktest(s, 'LONG', 0n, 1n, 3, D, BTC)).toThrow(RangeError);
  });
});
