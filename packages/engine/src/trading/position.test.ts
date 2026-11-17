import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { BTC, p, quote } from './fixtures.js';
import { applyFill, unrealizedPnlMinor, usedMarginMinor } from './position.js';
import type { PositionState } from './types.js';

const long = (qty: bigint, price: string, leverage = 10): PositionState => ({
  side: 'LONG',
  qty,
  avgEntryPrice: p(price),
  leverage,
});

describe('applyFill (netting)', () => {
  it('opens a new position', () => {
    const r = applyFill(null, { side: 'SELL', qty: 100n, price: p('3000.0'), leverage: 5 }, BTC);
    expect(r.position).toEqual({
      side: 'SHORT',
      qty: 100n,
      avgEntryPrice: p('3000.0'),
      leverage: 5,
    });
    expect(r.openedQty).toBe(100n);
  });

  it('increases with a weighted average entry', () => {
    const r = applyFill(
      long(100n, '60000.0'),
      { side: 'BUY', qty: 300n, price: p('62000.0'), leverage: 10 },
      BTC,
    );
    expect(r.position?.qty).toBe(400n);
    expect(r.position?.avgEntryPrice).toBe(p('61500.0'));
    expect(r.realizedPnlMinor).toBe(0n);
  });

  it('reduces and realizes PnL on the closed part only', () => {
    const r = applyFill(
      long(400n, '60000.0'),
      { side: 'SELL', qty: 100n, price: p('61000.0'), leverage: 10 },
      BTC,
    );
    expect(r.position?.qty).toBe(300n);
    expect(r.position?.avgEntryPrice).toBe(p('60000.0'));
    expect(r.realizedPnlMinor).toBe(10_000n); // $1,000 × 0.1 BTC = $100.00
  });

  it('closes fully', () => {
    const r = applyFill(
      long(100n, '60000.0'),
      { side: 'SELL', qty: 100n, price: p('59000.0'), leverage: 10 },
      BTC,
    );
    expect(r.position).toBeNull();
    expect(r.realizedPnlMinor).toBe(-10_000n);
  });

  it('flips: closes the long and opens a short with the remainder', () => {
    const r = applyFill(
      long(100n, '60000.0'),
      { side: 'SELL', qty: 250n, price: p('61000.0'), leverage: 20 },
      BTC,
    );
    expect(r.position).toEqual({
      side: 'SHORT',
      qty: 150n,
      avgEntryPrice: p('61000.0'),
      leverage: 20,
    });
    expect(r.closedQty).toBe(100n);
    expect(r.openedQty).toBe(150n);
    expect(r.realizedPnlMinor).toBe(10_000n);
  });

  it('property: buying then selling the same qty at the same price is flat with zero PnL', () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 1n, max: 10_000_000n }),
        fc.bigInt({ min: 1n, max: 2_000_000n }),
        (qty, price) => {
          const opened = applyFill(null, { side: 'BUY', qty, price, leverage: 1 }, BTC);
          const closed = applyFill(opened.position, { side: 'SELL', qty, price, leverage: 1 }, BTC);
          return closed.position === null && closed.realizedPnlMinor === 0n;
        },
      ),
    );
  });

  it('property: qty is conserved (net exposure = sum of signed fills)', () => {
    const fillArb = fc.record({
      side: fc.constantFrom<'BUY' | 'SELL'>('BUY', 'SELL'),
      qty: fc.bigInt({ min: 1n, max: 1_000n }),
      price: fc.bigInt({ min: 1n, max: 1_000_000n }),
    });
    fc.assert(
      fc.property(fc.array(fillArb, { maxLength: 30 }), (fills) => {
        let pos: PositionState | null = null;
        let net = 0n;
        for (const f of fills) {
          pos = applyFill(pos, { ...f, leverage: 1 }, BTC).position;
          net += f.side === 'BUY' ? f.qty : -f.qty;
        }
        const signed = pos ? (pos.side === 'LONG' ? pos.qty : -pos.qty) : 0n;
        return signed === net && (pos === null || pos.qty > 0n);
      }),
    );
  });
});

describe('unrealized PnL and margin', () => {
  it('marks longs at the bid and shorts at the ask', () => {
    const q = quote('61000.0', '61001.0');
    expect(unrealizedPnlMinor(long(1000n, '60000.0'), q, BTC)).toBe(100_000n);
    expect(
      unrealizedPnlMinor(
        { side: 'SHORT', qty: 1000n, avgEntryPrice: p('60000.0'), leverage: 10 },
        q,
        BTC,
      ),
    ).toBe(-100_100n);
  });

  it('used margin = entry notional / leverage', () => {
    expect(usedMarginMinor(long(1000n, '60000.0', 20), BTC)).toBe(300_000n); // $60k / 20 = $3,000
  });
});
