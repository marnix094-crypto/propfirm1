import { divRoundHalfEven } from '../money/fixed-point.js';
import { closePrice, notionalMinor, pnlMinor } from './pricing.js';
import type { InstrumentSpec, PositionSide, PositionState, Quote, Side } from './types.js';

export const directionOf = (side: PositionSide): 1n | -1n => (side === 'LONG' ? 1n : -1n);
export const positionSideFor = (side: Side): PositionSide => (side === 'BUY' ? 'LONG' : 'SHORT');

export interface FillResult {
  /** Resulting position, or null when flat. */
  position: PositionState | null;
  /** Realized PnL of the closed part (before commission). */
  realizedPnlMinor: bigint;
  closedQty: bigint;
  openedQty: bigint;
}

/**
 * Netting model: one position per instrument. Applies a fill and returns the new position.
 * Handles open, increase (weighted average entry), reduce, close and flip.
 */
export function applyFill(
  current: PositionState | null,
  fill: { side: Side; qty: bigint; price: bigint; leverage: number },
  spec: InstrumentSpec,
): FillResult {
  const fillSide = positionSideFor(fill.side);

  if (!current) {
    return {
      position: {
        side: fillSide,
        qty: fill.qty,
        avgEntryPrice: fill.price,
        leverage: fill.leverage,
      },
      realizedPnlMinor: 0n,
      closedQty: 0n,
      openedQty: fill.qty,
    };
  }

  if (current.side === fillSide) {
    const qty = current.qty + fill.qty;
    const avg = divRoundHalfEven(current.avgEntryPrice * current.qty + fill.price * fill.qty, qty);
    return {
      position: { ...current, qty, avgEntryPrice: avg },
      realizedPnlMinor: 0n,
      closedQty: 0n,
      openedQty: fill.qty,
    };
  }

  // Opposite side: reduce, close or flip.
  const closedQty = fill.qty < current.qty ? fill.qty : current.qty;
  const realized = pnlMinor(
    directionOf(current.side),
    current.avgEntryPrice,
    fill.price,
    closedQty,
    spec,
  );
  const remainder = fill.qty - closedQty;

  if (fill.qty < current.qty) {
    return {
      position: { ...current, qty: current.qty - fill.qty },
      realizedPnlMinor: realized,
      closedQty,
      openedQty: 0n,
    };
  }
  if (remainder === 0n) {
    return { position: null, realizedPnlMinor: realized, closedQty, openedQty: 0n };
  }
  return {
    position: {
      side: fillSide,
      qty: remainder,
      avgEntryPrice: fill.price,
      leverage: fill.leverage,
    },
    realizedPnlMinor: realized,
    closedQty,
    openedQty: remainder,
  };
}

/** Unrealized PnL marked at the closing side of the book. */
export function unrealizedPnlMinor(pos: PositionState, quote: Quote, spec: InstrumentSpec): bigint {
  const dir = directionOf(pos.side);
  return pnlMinor(dir, pos.avgEntryPrice, closePrice(dir, quote), pos.qty, spec);
}

/** Initial margin held for a position: entry notional ÷ leverage. */
export function usedMarginMinor(pos: PositionState, spec: InstrumentSpec): bigint {
  return divRoundHalfEven(notionalMinor(pos.avgEntryPrice, pos.qty, spec), BigInt(pos.leverage));
}
