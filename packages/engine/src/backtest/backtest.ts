import { applyBps } from '../money/fixed-point.js';
import { notionalMinor, pnlMinor } from '../trading/pricing.js';
import type { InstrumentSpec } from '../trading/types.js';
import type { ClosedTrade } from '../stats/performance.js';

/**
 * Bar-replay backtester (pure, bigint). Orders fill at the bar's close price; commission is
 * charged on each side's notional. One netting position at a time (like the live platform).
 */
export interface BacktestPosition {
  side: 'LONG' | 'SHORT';
  qty: bigint;
  entryPrice: bigint;
  openedAt: number;
}

export interface BacktestTrade extends ClosedTrade {
  side: 'LONG' | 'SHORT';
  qty: bigint;
  entryPrice: bigint;
  exitPrice: bigint;
  openedAt: number;
  closedAt: number;
}

export interface BacktestState {
  balanceMinor: bigint;
  position: BacktestPosition | null;
  trades: BacktestTrade[];
}

export const newBacktest = (balanceMinor: bigint): BacktestState => ({
  balanceMinor,
  position: null,
  trades: [],
});

const commission = (price: bigint, qty: bigint, spec: InstrumentSpec) =>
  applyBps(notionalMinor(price, qty, spec), spec.commissionBps);

const dir = (side: 'LONG' | 'SHORT') => (side === 'LONG' ? 1n : -1n);

/** Close the open position at `price` (bar close). */
export function closeBacktest(
  s: BacktestState,
  price: bigint,
  at: number,
  day: string,
  spec: InstrumentSpec,
): BacktestState {
  const p = s.position;
  if (!p) return s;
  const gross = pnlMinor(dir(p.side), p.entryPrice, price, p.qty, spec);
  const fee = commission(price, p.qty, spec);
  return {
    balanceMinor: s.balanceMinor + gross - fee,
    position: null,
    trades: [
      ...s.trades,
      {
        side: p.side,
        qty: p.qty,
        entryPrice: p.entryPrice,
        exitPrice: price,
        openedAt: p.openedAt,
        closedAt: at,
        day,
        netPnlMinor: gross - fee,
      },
    ],
  };
}

/** Open a position (an opposite open position is closed first). */
export function openBacktest(
  s: BacktestState,
  side: 'LONG' | 'SHORT',
  qty: bigint,
  price: bigint,
  at: number,
  day: string,
  spec: InstrumentSpec,
): BacktestState {
  if (qty < spec.minQty || qty % spec.qtyStep !== 0n) throw new RangeError('Invalid quantity');
  let next = s;
  if (s.position && s.position.side !== side) next = closeBacktest(s, price, at, day, spec);
  const fee = commission(price, qty, spec);
  const cur = next.position;
  const position: BacktestPosition = cur
    ? {
        side,
        qty: cur.qty + qty,
        // Volume-weighted average entry, rounded to the price grid by truncation.
        entryPrice: (cur.entryPrice * cur.qty + price * qty) / (cur.qty + qty),
        openedAt: cur.openedAt,
      }
    : { side, qty, entryPrice: price, openedAt: at };
  return { ...next, balanceMinor: next.balanceMinor - fee, position };
}

/** Equity = balance + open PnL at `price`. */
export function backtestEquity(s: BacktestState, price: bigint, spec: InstrumentSpec): bigint {
  const p = s.position;
  return p
    ? s.balanceMinor + pnlMinor(dir(p.side), p.entryPrice, price, p.qty, spec)
    : s.balanceMinor;
}
