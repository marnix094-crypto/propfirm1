/** Format an exact decimal string (price/qty) with fixed decimals, locale-aware, without float conversion. */
export function formatDecimal(
  value: string | null | undefined,
  decimals: number,
  locale: string,
): string {
  if (value === null || value === undefined || value === '') return '—';
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(
    value as unknown as number, // Intl accepts exact decimal strings (ES2023)
  );
}

/** Parse user input like "0,15" or "0.15" into a canonical decimal string, or null. */
export function normalizeDecimalInput(raw: string): string | null {
  const v = raw.trim().replace(',', '.');
  if (!/^\d*\.?\d*$/.test(v) || v === '' || v === '.') return null;
  const [w = '0', f = ''] = v.split('.');
  const whole = w.replace(/^0+(?=\d)/, '') || '0';
  return f ? `${whole}.${f}` : whole;
}

export const decimalsOf = (step: string) => (step.includes('.') ? step.split('.')[1]!.length : 0);
