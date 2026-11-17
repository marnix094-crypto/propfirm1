/**
 * Fixed-point helpers. All monetary values are bigint minor units (e.g. cents).
 * Never use JS floats for money.
 */

/** Divide with half-even (banker's) rounding. */
export function divRoundHalfEven(numerator: bigint, denominator: bigint): bigint {
  if (denominator === 0n) throw new RangeError('Division by zero');
  if (denominator < 0n) return divRoundHalfEven(-numerator, -denominator);
  const q = numerator / denominator; // truncates toward zero
  const r = numerator % denominator;
  if (r === 0n) return q;
  const twiceAbsR = (r < 0n ? -r : r) * 2n;
  const sign = numerator < 0n ? -1n : 1n;
  if (twiceAbsR > denominator) return q + sign;
  if (twiceAbsR < denominator) return q;
  return q % 2n === 0n ? q : q + sign; // exactly half → to even
}

/** Apply basis points (1 bp = 0.01%) to an amount, half-even rounded. */
export function applyBps(amount: bigint, bps: number | bigint): bigint {
  return divRoundHalfEven(amount * BigInt(bps), 10_000n);
}

/** Convert a fixed-point integer to an exact decimal string, e.g. (123456n, 2) → "1234.56". */
export function toDecimalString(value: bigint, decimals: number): string {
  if (!Number.isInteger(decimals) || decimals < 0) throw new RangeError('Invalid decimals');
  const negative = value < 0n;
  const digits = (negative ? -value : value).toString().padStart(decimals + 1, '0');
  const whole = digits.slice(0, digits.length - decimals);
  const frac = decimals > 0 ? `.${digits.slice(digits.length - decimals)}` : '';
  return `${negative ? '-' : ''}${whole}${frac}`;
}

/** Parse an exact decimal string into a fixed-point integer. Rejects excess precision. */
export function fromDecimalString(input: string, decimals: number): bigint {
  const match = /^(-)?(\d+)(?:\.(\d+))?$/.exec(input.trim());
  if (!match) throw new RangeError(`Invalid decimal: "${input}"`);
  const [, sign, whole = '0', frac = ''] = match;
  if (frac.length > decimals)
    throw new RangeError(`Too many decimals in "${input}" (max ${decimals})`);
  const value = BigInt(whole + frac.padEnd(decimals, '0'));
  return sign ? -value : value;
}

/**
 * Parse an external decimal string (e.g. from a market data feed) into fixed-point,
 * rounding half-even when it has more precision than `decimals`.
 */
export function parseDecimalRounded(input: string, decimals: number): bigint {
  const match = /^(-)?(\d+)(?:\.(\d+))?$/.exec(input.trim());
  if (!match) throw new RangeError(`Invalid decimal: "${input}"`);
  const [, sign, whole = '0', frac = ''] = match;
  let value: bigint;
  if (frac.length <= decimals) {
    value = BigInt(whole + frac.padEnd(decimals, '0'));
  } else {
    const extra = frac.length - decimals;
    value = divRoundHalfEven(BigInt(whole + frac), 10n ** BigInt(extra));
  }
  return sign ? -value : value;
}
