import { divRoundHalfEven } from '../money/fixed-point.js';
import { isOnTick, notionalMinor, touchPrice } from './pricing.js';
import { positionSideFor, unrealizedPnlMinor, usedMarginMinor } from './position.js';
import {
  TradingError,
  type InstrumentSpec,
  type OrderRequest,
  type PositionState,
  type Quote,
} from './types.js';

export interface MarkedPosition {
  position: PositionState;
  spec: InstrumentSpec;
  quote: Quote;
}

export interface AccountMetrics {
  balanceMinor: bigint;
  unrealizedPnlMinor: bigint;
  equityMinor: bigint;
  usedMarginMinor: bigint;
  freeMarginMinor: bigint;
  /** equity / usedMargin in bps; null when no margin is used. */
  marginLevelBps: bigint | null;
}

export function accountMetrics(balanceMinor: bigint, positions: MarkedPosition[]): AccountMetrics {
  let upnl = 0n;
  let used = 0n;
  for (const { position, spec, quote } of positions) {
    upnl += unrealizedPnlMinor(position, quote, spec);
    used += usedMarginMinor(position, spec);
  }
  const equity = balanceMinor + upnl;
  return {
    balanceMinor,
    unrealizedPnlMinor: upnl,
    equityMinor: equity,
    usedMarginMinor: used,
    freeMarginMinor: equity - used,
    marginLevelBps: used === 0n ? null : divRoundHalfEven(equity * 10_000n, used),
  };
}

/** True when the margin level fell to or below the stop-out level. */
export function isStopOut(metrics: AccountMetrics, stopOutLevelBps: number): boolean {
  return metrics.marginLevelBps !== null && metrics.marginLevelBps <= BigInt(stopOutLevelBps);
}

export interface ValidationContext {
  spec: InstrumentSpec;
  quote: Quote;
  /** Current position in this instrument (netting), if any. */
  position: PositionState | null;
  metrics: AccountMetrics;
  /** Account-level cap (e.g. from the rule set); the effective cap is min(account, instrument). */
  accountMaxLeverage: number;
}

/**
 * Pre-trade validation. Throws TradingError with a stable code.
 * Returns the portion of the order that opens new exposure (needs margin).
 */
export function validateOrder(order: OrderRequest, ctx: ValidationContext): { openingQty: bigint } {
  const { spec, quote, position } = ctx;

  if (order.qty <= 0n) throw new TradingError('INVALID_QTY');
  if (order.qty < spec.minQty) throw new TradingError('QTY_BELOW_MIN');
  if (order.qty % spec.qtyStep !== 0n) throw new TradingError('QTY_STEP');

  const maxLev = Math.min(spec.maxLeverage, ctx.accountMaxLeverage);
  if (!Number.isInteger(order.leverage) || order.leverage < 1 || order.leverage > maxLev) {
    throw new TradingError('LEVERAGE_INVALID');
  }

  if (order.type === 'LIMIT') {
    if (order.limitPrice === undefined || order.limitPrice <= 0n)
      throw new TradingError('LIMIT_PRICE_REQUIRED');
    if (!isOnTick(order.limitPrice, spec.tickSize)) throw new TradingError('PRICE_TICK');
  }
  if (order.type === 'STOP') {
    if (order.stopPrice === undefined || order.stopPrice <= 0n)
      throw new TradingError('STOP_PRICE_REQUIRED');
    if (!isOnTick(order.stopPrice, spec.tickSize)) throw new TradingError('PRICE_TICK');
    // A stop must be beyond the market, otherwise it would trigger immediately.
    if (order.side === 'BUY' ? order.stopPrice <= quote.ask : order.stopPrice >= quote.bid) {
      throw new TradingError('STOP_PRICE_INVALID');
    }
  }

  const orderSide = positionSideFor(order.side);
  const reducing = position !== null && position.side !== orderSide;
  const reducibleQty = reducing ? position.qty : 0n;
  const openingQty = order.qty > reducibleQty ? order.qty - reducibleQty : 0n;

  if (order.reduceOnly) {
    if (!position) throw new TradingError('REDUCE_ONLY_NO_POSITION');
    if (!reducing || openingQty > 0n) throw new TradingError('REDUCE_ONLY_WOULD_INCREASE');
  }

  // Netting: adding to a position must use the position's leverage.
  if (position && !reducing && order.leverage !== position.leverage) {
    throw new TradingError('LEVERAGE_MISMATCH');
  }

  if (openingQty > 0n) {
    const refPrice =
      order.type === 'LIMIT'
        ? order.limitPrice!
        : order.type === 'STOP'
          ? order.stopPrice!
          : touchPrice(order.side, quote);
    const notional = notionalMinor(refPrice, openingQty, spec);
    const required =
      divRoundHalfEven(notional, BigInt(order.leverage)) +
      divRoundHalfEven(
        notionalMinor(refPrice, order.qty, spec) * BigInt(spec.commissionBps),
        10_000n,
      );
    if (required > ctx.metrics.freeMarginMinor) throw new TradingError('INSUFFICIENT_MARGIN');
  }

  return { openingQty };
}
