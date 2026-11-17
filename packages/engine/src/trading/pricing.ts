import { divRoundHalfEven } from '../money/fixed-point.js';
import type { InstrumentSpec, Quote, Side } from './types.js';

const pow10 = (n: number) => 10n ** BigInt(n);
const MINOR_PER_UNIT = 100n; // USD cents
const USD_100K_MINOR = 10_000_000n;

/** price × qty → account currency minor units (cents), half-even. */
export function notionalMinor(price: bigint, qty: bigint, spec: InstrumentSpec): bigint {
  return divRoundHalfEven(
    price * qty * MINOR_PER_UNIT,
    pow10(spec.priceDecimals + spec.qtyDecimals),
  );
}

/** (exitPrice − entryPrice) × qty, signed for the position direction → minor units. */
export function pnlMinor(
  direction: 1n | -1n,
  entryPrice: bigint,
  exitPrice: bigint,
  qty: bigint,
  spec: InstrumentSpec,
): bigint {
  return divRoundHalfEven(
    direction * (exitPrice - entryPrice) * qty * MINOR_PER_UNIT,
    pow10(spec.priceDecimals + spec.qtyDecimals),
  );
}

/** Round a price to the tick grid, against the trader (BUY up, SELL down). */
export function roundToTickAdverse(price: bigint, side: Side, tick: bigint): bigint {
  const r = price % tick;
  if (r === 0n) return price;
  return side === 'BUY' ? price - r + tick : price - r;
}

export function isOnTick(price: bigint, tick: bigint): boolean {
  return price % tick === 0n;
}

/** Move a price by `bps` against the trader. */
function adverse(price: bigint, side: Side, bpsTimes2: bigint): bigint {
  // bpsTimes2 is expressed in half-basis-points to allow half of the spread markup per side.
  const delta = divRoundHalfEven(price * bpsTimes2, 20_000n);
  return side === 'BUY' ? price + delta : price - delta;
}

/** Market side the trader takes: BUY lifts the ask, SELL hits the bid. */
export function touchPrice(side: Side, quote: Quote): bigint {
  return side === 'BUY' ? quote.ask : quote.bid;
}

/** Price the trader would close a position at (LONG closes on bid, SHORT on ask). */
export function closePrice(direction: 1n | -1n, quote: Quote): bigint {
  return direction === 1n ? quote.bid : quote.ask;
}

export function slippageBps(notional: bigint, spec: InstrumentSpec): number {
  const impact = Number((notional * BigInt(spec.slippageImpactBpsPer100k)) / USD_100K_MINOR);
  return Math.min(spec.slippageMaxBps, spec.slippageBaseBps + impact);
}

export interface ExecutionQuote {
  /** Final fill price, on the tick grid. */
  price: bigint;
  /** Raw market touch price before markup and slippage. */
  referencePrice: bigint;
  spreadCostMinor: bigint;
  slippageCostMinor: bigint;
  commissionMinor: bigint;
}

/**
 * Execution price for an immediately executable (market or triggered stop) order:
 * touch price + half the spread markup + size-dependent slippage, rounded adversely to tick.
 */
export function marketExecution(
  side: Side,
  qty: bigint,
  quote: Quote,
  spec: InstrumentSpec,
): ExecutionQuote {
  const ref = touchPrice(side, quote);
  const withSpread = adverse(ref, side, BigInt(spec.spreadMarkupBps));
  const refNotional = notionalMinor(ref, qty, spec);
  const slip = slippageBps(refNotional, spec);
  const raw = adverse(withSpread, side, BigInt(slip) * 2n);
  const price = roundToTickAdverse(raw, side, spec.tickSize);
  return costs(side, qty, ref, withSpread, price, spec);
}

/**
 * Limit fill: executable when the (marked-up) touch price is at or better than the limit.
 * Fills at the better of limit and current price; no slippage.
 */
export function limitExecution(
  side: Side,
  qty: bigint,
  limitPrice: bigint,
  quote: Quote,
  spec: InstrumentSpec,
): ExecutionQuote | null {
  const ref = touchPrice(side, quote);
  const withSpread = roundToTickAdverse(
    adverse(ref, side, BigInt(spec.spreadMarkupBps)),
    side,
    spec.tickSize,
  );
  const executable = side === 'BUY' ? withSpread <= limitPrice : withSpread >= limitPrice;
  if (!executable) return null;
  const price =
    side === 'BUY'
      ? withSpread < limitPrice
        ? withSpread
        : limitPrice
      : withSpread > limitPrice
        ? withSpread
        : limitPrice;
  return costs(side, qty, ref, price, price, spec);
}

/** Stop orders trigger when the touch price crosses the stop (BUY: ask ≥ stop, SELL: bid ≤ stop). */
export function isStopTriggered(side: Side, stopPrice: bigint, quote: Quote): boolean {
  return side === 'BUY' ? quote.ask >= stopPrice : quote.bid <= stopPrice;
}

function costs(
  side: Side,
  qty: bigint,
  ref: bigint,
  withSpread: bigint,
  price: bigint,
  spec: InstrumentSpec,
): ExecutionQuote {
  const dir = side === 'BUY' ? 1n : -1n;
  const spreadCostMinor = pnlMinor(dir, ref, withSpread, qty, spec);
  const slippageCostMinor = pnlMinor(dir, withSpread, price, qty, spec);
  const commissionMinor = divRoundHalfEven(
    notionalMinor(price, qty, spec) * BigInt(spec.commissionBps),
    10_000n,
  );
  return { price, referencePrice: ref, spreadCostMinor, slippageCostMinor, commissionMinor };
}
