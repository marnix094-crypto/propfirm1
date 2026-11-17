import type { InstrumentSpec, Quote } from './types.js';

/** Test fixture resembling BTCUSDT perpetual: price 0.1 tick (1 decimal), qty 0.001 step (3 decimals). */
export const BTC: InstrumentSpec = {
  symbol: 'BTCUSDT',
  priceDecimals: 1,
  qtyDecimals: 3,
  tickSize: 1n,
  minQty: 1n,
  qtyStep: 1n,
  maxLeverage: 100,
  spreadMarkupBps: 2,
  commissionBps: 4,
  slippageBaseBps: 1,
  slippageImpactBpsPer100k: 1,
  slippageMaxBps: 10,
};

/** price helper: p(67000.5) → 670005n for 1-decimal instruments. */
export const p = (v: string) => BigInt(v.replace('.', ''));
export const quote = (bid: string, ask: string): Quote => ({ bid: p(bid), ask: p(ask), ts: 0 });
