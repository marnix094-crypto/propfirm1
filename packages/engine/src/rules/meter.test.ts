import { describe, expect, it } from 'vitest';
import { meterRatioBps, meterState } from './meter.js';

describe('meterState', () => {
  const limit = 500_000n; // $5,000.00 daily loss
  it.each([
    [0n, 'safe'],
    [349_999n, 'safe'],
    [350_000n, 'warn'], // exactly 70%
    [499_999n, 'warn'],
    [500_000n, 'breach'],
    [900_000n, 'breach'],
  ] as const)('used %s → %s', (used, state) => {
    expect(meterState(used, limit)).toBe(state);
  });

  it('supports custom warn threshold', () => {
    expect(meterState(400_000n, limit, 9_000)).toBe('safe');
  });

  it('handles zero limit', () => {
    expect(meterState(0n, 0n)).toBe('safe');
    expect(meterState(1n, 0n)).toBe('breach');
  });
});

describe('meterRatioBps', () => {
  it('clamps', () => {
    expect(meterRatioBps(250_000n, 500_000n)).toBe(5_000);
    expect(meterRatioBps(900_000n, 500_000n)).toBe(10_000);
    expect(meterRatioBps(-1n, 500_000n)).toBe(0);
  });
});
