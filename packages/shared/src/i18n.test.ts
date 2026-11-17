import { describe, expect, it } from 'vitest';
import { DEFAULT_LOCALE, isLocale } from './i18n.js';

describe('locales', () => {
  it('defaults to English', () => expect(DEFAULT_LOCALE).toBe('en'));
  it('validates', () => {
    expect(isLocale('nl')).toBe(true);
    expect(isLocale('de')).toBe(false);
  });
});
