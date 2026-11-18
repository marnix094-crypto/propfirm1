import { describe, expect, it } from 'vitest';
import { brandPalette, contrast } from './brand-color';

describe('brandPalette', () => {
  it.each(['#AFE604', '#FF5A1F', '#1D4ED8', '#FACC15', '#111111', '#FFFFFF', '#10B981'])(
    'keeps AA contrast for %s',
    (hex) => {
      const p = brandPalette(hex);
      expect(contrast(p.fill, p.onFill)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(p.deep, '#ffffff')).toBeGreaterThanOrEqual(4.5);
      expect(contrast(p.onInk, '#0a0a0a')).toBeGreaterThanOrEqual(4.5);
    },
  );

  it('puts dark text on light brand colours and white on dark ones', () => {
    expect(brandPalette('#AFE604').onFill).toBe('#0a0a0a');
    expect(brandPalette('#1D4ED8').onFill).toBe('#ffffff');
  });
});
