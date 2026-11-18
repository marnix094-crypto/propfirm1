// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Guards WCAG 2.2 AA contrast of the palette in tokens.css.
 * Text pairs need ≥ 4.5:1; large text / UI graphics need ≥ 3:1.
 */
const css = readFileSync(fileURLToPath(new URL('./tokens.css', import.meta.url)), 'utf8');

function block(selector: RegExp): Record<string, string> {
  const m = selector.exec(css);
  if (!m) throw new Error(`Block not found: ${selector}`);
  const body = css.slice(m.index + m[0].length, css.indexOf('}', m.index));
  const vars: Record<string, string> = {};
  for (const [, name, value] of body.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g))
    vars[name!] = value!;
  return vars;
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

const light = block(/:root,\s*:root\[data-theme='light'\]\s*\{/);
const dark = { ...light, ...block(/:root\[data-theme='dark'\]\s*\{/) };
const platformDark = {
  ...dark,
  ...block(/:root\[data-surface='platform'\]\[data-theme='dark'\]\s*\{/),
};
const platformLight = {
  ...light,
  ...block(/:root\[data-surface='platform'\]\[data-theme='light'\]\s*\{/),
};

type Pair = [fg: string, bg: string, min: number];
const TEXT_PAIRS: Pair[] = [
  ['text', 'bg', 4.5],
  ['text', 'card', 4.5],
  ['text-muted', 'card', 4.5],
  ['text-link', 'card', 4.5],
  ['profit-text', 'card', 4.5],
  ['loss-text', 'card', 4.5],
  ['warn-text', 'card', 4.5],
  ['btn-secondary-fg', 'btn-secondary-bg', 4.5],
  ['text-on-accent', 'accent-deep', 4.5],
  ['text-muted', 'bg', 4.5],
  ['btn-primary-fg', 'btn-primary-from', 4.5],
  ['btn-primary-fg', 'btn-primary-to', 4.5],
  ['on-trade-action', 'buy-bg', 4.5],
  ['on-trade-action', 'sell-bg', 4.5],
  ['focus-ring', 'bg', 3],
  ['meter-safe', 'card', 3],
  ['meter-breach', 'card', 3],
  ['chart-line', 'card', 3],
  ['text', 'card-muted', 4.5],
  ['text-muted', 'card-muted', 4.5],
];

describe.each([
  ['light', light],
  ['dark', dark],
  ['platform dark', platformDark],
  ['platform light', platformLight],
] as const)('%s theme contrast', (_theme, vars) => {
  it.each(TEXT_PAIRS)('%s on %s ≥ %s:1', (fg, bg, min) => {
    const ratio = contrast(vars[fg]!, vars[bg]!);
    expect(
      ratio,
      `${fg} (${vars[fg]}) on ${bg} (${vars[bg]}) = ${ratio.toFixed(2)}`,
    ).toBeGreaterThanOrEqual(min);
  });
});

function mix(fg: string, bg: string, p: number): string {
  const ch = (h: string, i: number) => parseInt(h.slice(i, i + 2), 16);
  return (
    '#' +
    [1, 3, 5]
      .map((i) =>
        Math.round(ch(bg, i) + (ch(fg, i) - ch(bg, i)) * p)
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
  );
}

describe.each([
  ['light', light],
  ['dark', dark],
  ['platform dark', platformDark],
  ['platform light', platformLight],
] as const)('%s status badges', (_theme, vars) => {
  it.each([
    ['badge-success-fg', 'profit'],
    ['badge-warn-fg', 'meter-warn'],
    ['badge-danger-fg', 'loss'],
  ])('%s on a 18%% tint of %s (over card and card-muted) ≥ 4.5:1', (fg, tint) => {
    for (const surface of ['card', 'card-muted']) {
      const bg = mix(vars[tint]!, vars[surface]!, 0.18);
      expect(contrast(vars[fg]!, bg), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe('closing CTA band', () => {
  it('white text meets AA on every gradient stop', () => {
    for (const stop of ['#0a0a0a', '#151a08', '#1f2b05']) {
      expect(contrast('#ffffff', stop)).toBeGreaterThanOrEqual(4.5);
    }
  });
});
