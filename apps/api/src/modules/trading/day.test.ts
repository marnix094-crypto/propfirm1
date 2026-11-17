import { describe, expect, it } from 'vitest';
import { tradingDayStart } from './day.js';

describe('tradingDayStart (Europe/Amsterdam)', () => {
  it('winter time: midnight CET = 23:00 UTC previous day', () => {
    expect(tradingDayStart(new Date('2026-01-15T10:00:00Z')).toISOString()).toBe(
      '2026-01-14T23:00:00.000Z',
    );
  });
  it('summer time: midnight CEST = 22:00 UTC previous day', () => {
    expect(tradingDayStart(new Date('2026-07-15T10:00:00Z')).toISOString()).toBe(
      '2026-07-14T22:00:00.000Z',
    );
  });
  it('just after local midnight belongs to the new day', () => {
    expect(tradingDayStart(new Date('2026-01-14T23:00:01Z')).toISOString()).toBe(
      '2026-01-14T23:00:00.000Z',
    );
    expect(tradingDayStart(new Date('2026-01-14T22:59:59Z')).toISOString()).toBe(
      '2026-01-13T23:00:00.000Z',
    );
  });
});
