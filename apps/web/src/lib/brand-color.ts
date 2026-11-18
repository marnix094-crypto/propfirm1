/**
 * Derives an accessible platform palette from a firm's brand colour (D89).
 * The brand colour is only used as a fill; text on it and coloured text on white are
 * computed so both reach WCAG AA (4.5:1).
 */
type Rgb = [number, number, number];

/** Daily Funded lime (logo) — the default when a firm sets no colour of its own. */
export const DEFAULT_BRAND_COLOR = '#AFE604';

export const isHexColor = (v: string) => /^#[0-9a-f]{6}$/i.test(v);

function toRgb(hex: string): Rgb {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const toHex = (c: Rgb) =>
  `#${c
    .map((v) =>
      Math.round(Math.min(255, Math.max(0, v)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;

function luminance([r, g, b]: Rgb): number {
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function contrast(a: string, b: string): number {
  const [l1, l2] = [luminance(toRgb(a)), luminance(toRgb(b))].sort((x, y) => y - x) as [
    number,
    number,
  ];
  return (l1 + 0.05) / (l2 + 0.05);
}

const mix = (a: Rgb, b: Rgb, t: number): Rgb => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

export interface BrandPalette {
  /** The brand colour itself: buttons, active pills, highlights. */
  fill: string;
  /** Text/icons on `fill` (near-black or white, whichever contrasts more). */
  onFill: string;
  /** Light wash for selected states. */
  tint: string;
  /** Brand-coloured text/links on white (darkened until AA). */
  deep: string;
  /** Brand-coloured text on the near-black ink (lightened until AA). */
  onInk: string;
}

const INK = '#0a0a0a';
const WHITE = '#ffffff';

export function brandPalette(hex: string): BrandPalette {
  const fill = hex.toLowerCase();
  const onFill = contrast(fill, INK) >= contrast(fill, WHITE) ? INK : WHITE;
  const rgb = toRgb(fill);
  const tint = toHex(mix(rgb, [255, 255, 255], 0.78));
  let deep = fill;
  for (let t = 0; contrast(deep, WHITE) < 4.5 && t <= 1; t += 0.05)
    deep = toHex(mix(rgb, [0, 0, 0], t));
  let onInk = fill;
  for (let t = 0; contrast(onInk, INK) < 4.5 && t <= 1; t += 0.05)
    onInk = toHex(mix(rgb, [255, 255, 255], t));
  return { fill, onFill, tint, deep, onInk };
}
