import { toDecimalString } from '@brand/engine';

/**
 * Format bigint minor units as currency without ever going through a float.
 * Intl.NumberFormat accepts exact decimal strings (ES2023).
 */
export function formatMoneyMinor(
  minor: bigint,
  currency: string,
  locale: string,
  opts: {
    decimals?: number;
    signDisplay?: Intl.NumberFormatOptions['signDisplay'];
    /** Short form for dense views, e.g. "$1.2K" (display only). */
    notation?: 'standard' | 'compact';
  } = {},
): string {
  const decimals = opts.decimals ?? 2;
  const compact = opts.notation === 'compact';
  const nf = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    notation: opts.notation ?? 'standard',
    minimumFractionDigits: compact ? 0 : decimals,
    maximumFractionDigits: compact ? 1 : decimals,
    signDisplay: opts.signDisplay ?? 'auto',
  });
  return nf.format(toDecimalString(minor, decimals) as unknown as number);
}

/** Format basis points as a percentage string, e.g. 1000 → "10%". */
export function formatBps(bps: number, locale: string, maxFractionDigits = 2): string {
  return new Intl.NumberFormat(locale, {
    style: 'percent',
    maximumFractionDigits: maxFractionDigits,
  }).format(bps / 10_000);
}

/** Format an integer leverage as "1:50". */
export function formatLeverage(leverage: number): string {
  return `1:${leverage}`;
}
