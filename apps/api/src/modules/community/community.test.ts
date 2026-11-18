import { describe, expect, it } from 'vitest';
import { amsterdamMonth, anonymousName } from './community.service.js';

describe('amsterdamMonth', () => {
  it('uses Amsterdam midnight boundaries across DST', () => {
    const nov = amsterdamMonth(new Date('2026-11-18T10:00:00Z'));
    expect(nov.slug).toBe('monthly-2026-11');
    expect(nov.start.toISOString()).toBe('2026-10-31T23:00:00.000Z'); // CET (UTC+1)
    expect(nov.end.toISOString()).toBe('2026-11-30T23:00:00.000Z');
    const apr = amsterdamMonth(new Date('2026-04-10T10:00:00Z'));
    expect(apr.start.toISOString()).toBe('2026-03-31T22:00:00.000Z'); // CEST (UTC+2)
    // 23:30 UTC on 31 Oct is already November in Amsterdam.
    expect(amsterdamMonth(new Date('2026-10-31T23:30:00Z')).slug).toBe('monthly-2026-11');
  });

  it('anonymous names are stable and contain no personal data', () => {
    expect(anonymousName('abc')).toBe(anonymousName('abc'));
    expect(anonymousName('abc')).toMatch(/^Trader [0-9A-F]{4}$/);
  });
});
