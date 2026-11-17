export type MeterState = 'safe' | 'warn' | 'breach';

/** Default: warn from 70% of a limit. */
export const DEFAULT_WARN_RATIO_BPS = 7_000;

/**
 * Classify how close `used` is to `limit` (both non-negative bigint minor units).
 * safe < warn threshold ≤ warn < limit ≤ breach.
 */
export function meterState(
  used: bigint,
  limit: bigint,
  warnRatioBps: number = DEFAULT_WARN_RATIO_BPS,
): MeterState {
  if (limit <= 0n) return used > 0n ? 'breach' : 'safe';
  if (used >= limit) return 'breach';
  if (used * 10_000n >= limit * BigInt(warnRatioBps)) return 'warn';
  return 'safe';
}

/** Fill ratio in basis points, clamped to 0..10000 — for rendering only. */
export function meterRatioBps(used: bigint, limit: bigint): number {
  if (limit <= 0n) return used > 0n ? 10_000 : 0;
  const ratio = (used * 10_000n) / limit;
  return Number(ratio < 0n ? 0n : ratio > 10_000n ? 10_000n : ratio);
}
