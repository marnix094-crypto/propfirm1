import { describe, expect, it } from 'vitest';
import { applyBps, divRoundHalfEven, fromDecimalString, toDecimalString } from './fixed-point';

describe('divRoundHalfEven', () => {
  it.each([
    [5n, 2n, 2n], // 2.5 → 2
    [7n, 2n, 4n], // 3.5 → 4
    [-5n, 2n, -2n],
    [-7n, 2n, -4n],
    [10n, 3n, 3n],
    [11n, 3n, 4n],
    [-11n, 3n, -4n],
    [5n, -2n, -2n],
    [6n, 3n, 2n],
  ])('%s / %s = %s', (n, d, expected) => {
    expect(divRoundHalfEven(n, d)).toBe(expected);
  });

  it('throws on division by zero', () => {
    expect(() => divRoundHalfEven(1n, 0n)).toThrow(RangeError);
  });
});

describe('applyBps', () => {
  it('computes 10% of $100,000.00', () => {
    expect(applyBps(10_000_000n, 1_000)).toBe(1_000_000n);
  });
  it('rounds half-even', () => {
    expect(applyBps(5n, 5_000)).toBe(2n); // 2.5 → 2
    expect(applyBps(15n, 5_000)).toBe(8n); // 7.5 → 8
  });
});

describe('decimal strings', () => {
  it.each([
    [123456n, 2, '1234.56'],
    [5n, 2, '0.05'],
    [-5n, 2, '-0.05'],
    [0n, 0, '0'],
    [100n, 8, '0.00000100'],
  ])('toDecimalString(%s, %s) = %s', (v, d, s) => {
    expect(toDecimalString(v, d)).toBe(s);
    expect(fromDecimalString(s, d)).toBe(v);
  });

  it('pads missing decimals', () => {
    expect(fromDecimalString('12.5', 2)).toBe(1250n);
  });

  it('rejects floats with excess precision and garbage', () => {
    expect(() => fromDecimalString('1.234', 2)).toThrow();
    expect(() => fromDecimalString('1e5', 2)).toThrow();
    expect(() => fromDecimalString('', 2)).toThrow();
  });
});
