import { describe, expect, it } from 'vitest';
import { SimulatedAdapter } from './simulated.adapter.js';
import type { RawQuote } from './types.js';

describe('SimulatedAdapter', () => {
  const inst = [{ symbol: 'BTCUSDT', priceDecimals: 1, referencePrice: '67000.0' }];

  it('emits valid, uncrossed quotes on the tick grid', () => {
    const quotes: RawQuote[] = [];
    const a = new SimulatedAdapter(inst, 250, () => 1_700_000_000_000);
    const h = {
      onQuote: (q: RawQuote) => quotes.push(q),
      onMark: () => {},
      onCandle: () => {},
      onStatus: () => {},
    };
    for (let i = 0; i < 50; i++) a.tick(h);
    expect(quotes).toHaveLength(50);
    for (const q of quotes) {
      expect(Number(q.ask)).toBeGreaterThan(Number(q.bid));
      expect(q.bid).toMatch(/^\d+\.\d$/);
    }
  });

  it('produces deterministic, consistent candle history', async () => {
    const a = new SimulatedAdapter(inst, 250, () => 1_700_000_000_000);
    const c1 = await a.getCandles('BTCUSDT', '1h', 100);
    const c2 = await a.getCandles('BTCUSDT', '1h', 100);
    expect(c1).toEqual(c2);
    expect(c1).toHaveLength(100);
    for (const c of c1) {
      expect(Number(c.h)).toBeGreaterThanOrEqual(Math.max(Number(c.o), Number(c.c)));
      expect(Number(c.l)).toBeLessThanOrEqual(Math.min(Number(c.o), Number(c.c)));
    }
    expect(c1[1]!.openTime - c1[0]!.openTime).toBe(3_600_000);
  });
});
