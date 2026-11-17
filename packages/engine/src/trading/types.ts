/**
 * Core trading types. All prices/quantities are fixed-point bigint integers using
 * the instrument's `priceDecimals` / `qtyDecimals`. All money is bigint minor units (cents).
 */
export type Side = 'BUY' | 'SELL';
export type OrderType = 'MARKET' | 'LIMIT' | 'STOP';
export type PositionSide = 'LONG' | 'SHORT';

export interface InstrumentSpec {
  symbol: string;
  priceDecimals: number;
  qtyDecimals: number;
  /** Minimum price increment, in price units. */
  tickSize: bigint;
  /** Minimum order quantity, in qty units. */
  minQty: bigint;
  /** Quantity increment, in qty units. */
  qtyStep: bigint;
  maxLeverage: number;
  /** Extra spread on top of the market bid/ask, total (half applied per side). */
  spreadMarkupBps: number;
  /** Commission on notional per fill. */
  commissionBps: number;
  /** Base slippage for market/stop fills. */
  slippageBaseBps: number;
  /** Additional slippage per $100,000 of notional. */
  slippageImpactBpsPer100k: number;
  slippageMaxBps: number;
}

/** Top of book. bid/ask in price units. */
export interface Quote {
  bid: bigint;
  ask: bigint;
  ts: number;
}

export interface PositionState {
  side: PositionSide;
  /** Always positive, in qty units. */
  qty: bigint;
  avgEntryPrice: bigint;
  leverage: number;
}

export interface OrderRequest {
  side: Side;
  type: OrderType;
  qty: bigint;
  limitPrice?: bigint;
  stopPrice?: bigint;
  leverage: number;
  reduceOnly?: boolean;
}

export type RejectCode =
  | 'INVALID_QTY'
  | 'QTY_BELOW_MIN'
  | 'QTY_STEP'
  | 'PRICE_TICK'
  | 'LIMIT_PRICE_REQUIRED'
  | 'STOP_PRICE_REQUIRED'
  | 'STOP_PRICE_INVALID'
  | 'LEVERAGE_INVALID'
  | 'LEVERAGE_MISMATCH'
  | 'REDUCE_ONLY_NO_POSITION'
  | 'REDUCE_ONLY_WOULD_INCREASE'
  | 'INSUFFICIENT_MARGIN';

export class TradingError extends Error {
  constructor(
    readonly code: RejectCode,
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'TradingError';
  }
}
