import { divRoundHalfEven } from '../money/fixed-point.js';
import { notionalMinor } from './pricing.js';
import { directionOf } from './position.js';
import type { InstrumentSpec, PositionState } from './types.js';

/** Funding rates are fixed-point with 8 decimals, like Binance ("0.00010000" = 0.01%). */
export const FUNDING_RATE_SCALE = 100_000_000n;

/**
 * Funding payment for one interval, marked at `markPrice`.
 * Positive rate: longs pay, shorts receive. Returns the amount to ADD to the balance (negative = charge).
 */
export function fundingPaymentMinor(
  pos: PositionState,
  markPrice: bigint,
  rate: bigint,
  spec: InstrumentSpec,
): bigint {
  const notional = notionalMinor(markPrice, pos.qty, spec);
  return -directionOf(pos.side) * divRoundHalfEven(notional * rate, FUNDING_RATE_SCALE);
}
