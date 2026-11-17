import { describe, expect, it } from 'vitest';
import { BTC, p, quote } from './fixtures.js';
import {
  isStopTriggered,
  limitExecution,
  marketExecution,
  notionalMinor,
  pnlMinor,
  roundToTickAdverse,
  slippageBps,
} from './pricing.js';

describe('notionalMinor', () => {
  it('BTC 67,000.0 × 0.150 = $10,050.00', () => {
    expect(notionalMinor(p('67000.0'), 150n, BTC)).toBe(1_005_000n);
  });
  it('rounds half-even to the cent', () => {
    // 0.5 × 0.001 = $0.0005 → 0 cents (half-even of 0.05 cents)
    expect(notionalMinor(5n, 1n, BTC)).toBe(0n);
  });
});

describe('pnlMinor', () => {
  it('long gains when price rises, short loses', () => {
    expect(pnlMinor(1n, p('60000.0'), p('61000.0'), 1000n, BTC)).toBe(100_000n);
    expect(pnlMinor(-1n, p('60000.0'), p('61000.0'), 1000n, BTC)).toBe(-100_000n);
  });
});

describe('roundToTickAdverse', () => {
  it('rounds buys up and sells down', () => {
    expect(roundToTickAdverse(1005n, 'BUY', 10n)).toBe(1010n);
    expect(roundToTickAdverse(1005n, 'SELL', 10n)).toBe(1000n);
    expect(roundToTickAdverse(1000n, 'BUY', 10n)).toBe(1000n);
  });
});

describe('slippageBps', () => {
  it('grows with size and is capped', () => {
    expect(slippageBps(1_000_000n, BTC)).toBe(1); // $10k
    expect(slippageBps(50_000_000n, BTC)).toBe(6); // $500k → 1 + 5
    expect(slippageBps(10_000_000_000n, BTC)).toBe(10); // capped
  });
});

describe('marketExecution', () => {
  const q = quote('67000.0', '67000.1');

  it('buys above the ask (spread + slippage), costs are non-negative', () => {
    const ex = marketExecution('BUY', 150n, q, BTC);
    expect(ex.referencePrice).toBe(p('67000.1'));
    // +1 bp half-spread = 6.7, +1 bp slippage = 6.7 → 67013.5 (ceil to tick)
    expect(ex.price).toBe(p('67013.5'));
    expect(ex.spreadCostMinor).toBeGreaterThan(0n);
    expect(ex.slippageCostMinor).toBeGreaterThanOrEqual(0n);
    expect(ex.commissionMinor).toBe(402n); // 4 bps of $10,052.03
  });

  it('sells below the bid', () => {
    const ex = marketExecution('SELL', 150n, q, BTC);
    expect(ex.price).toBeLessThan(q.bid);
    expect(ex.price).toBe(p('66986.6'));
  });
});

describe('limitExecution', () => {
  const q = quote('67000.0', '67000.1');
  it('does not fill a buy limit below the marked-up ask', () => {
    expect(limitExecution('BUY', 1n, p('66990.0'), q, BTC)).toBeNull();
  });
  it('fills a marketable buy limit at the better current price', () => {
    const ex = limitExecution('BUY', 1n, p('67100.0'), q, BTC)!;
    expect(ex.price).toBe(p('67006.8'));
    expect(ex.slippageCostMinor).toBe(0n);
  });
  it('fills a sell limit when the bid rises through it, at the limit or better', () => {
    const ex = limitExecution('SELL', 1n, p('66990.0'), q, BTC)!;
    expect(ex.price).toBe(p('66993.3'));
  });
});

describe('isStopTriggered', () => {
  const q = quote('67000.0', '67000.1');
  it('buy stop triggers on ask ≥ stop', () => {
    expect(isStopTriggered('BUY', p('67000.1'), q)).toBe(true);
    expect(isStopTriggered('BUY', p('67000.2'), q)).toBe(false);
  });
  it('sell stop triggers on bid ≤ stop', () => {
    expect(isStopTriggered('SELL', p('67000.0'), q)).toBe(true);
    expect(isStopTriggered('SELL', p('66999.9'), q)).toBe(false);
  });
});
