import { describe, expect, it } from 'vitest';
import { formatBps, formatLeverage, formatMoneyMinor } from './format';

const nbsp = new RegExp('[\\u00a0\\u202f]', 'g');
const norm = (s: string) => s.replace(nbsp, ' ');

describe('formatMoneyMinor', () => {
  it('formats USD in en-US', () => {
    expect(formatMoneyMinor(10_000_000n, 'USD', 'en-US')).toBe('$100,000.00');
  });
  it('formats EUR in nl-NL', () => {
    expect(norm(formatMoneyMinor(123_456n, 'EUR', 'nl-NL'))).toBe('€ 1.234,56');
  });
  it('is exact for values beyond float precision', () => {
    expect(formatMoneyMinor(900_719_925_474_099_312n, 'USD', 'en-US')).toBe(
      '$9,007,199,254,740,993.12',
    );
  });
  it('shows sign for PnL', () => {
    expect(formatMoneyMinor(-5_00n, 'USD', 'en-US', { signDisplay: 'exceptZero' })).toBe('-$5.00');
    expect(formatMoneyMinor(5_00n, 'USD', 'en-US', { signDisplay: 'exceptZero' })).toBe('+$5.00');
  });
});

describe('formatBps / formatLeverage', () => {
  it('formats', () => {
    expect(formatBps(1_000, 'en-US')).toBe('10%');
    expect(formatBps(250, 'en-US')).toBe('2.5%');
    expect(formatLeverage(50)).toBe('1:50');
  });
});
