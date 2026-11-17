import { toDecimalString, type InstrumentSpec } from '@brand/engine';
import type { Fill, LedgerEntry, Order, Position } from '../../generated/prisma/client.js';
import type { FillDto, LedgerEntryDto, OrderDto } from './dto.js';

const px = (v: bigint | null, spec: InstrumentSpec) =>
  v === null ? null : toDecimalString(v, spec.priceDecimals);
const q = (v: bigint, spec: InstrumentSpec) => toDecimalString(v, spec.qtyDecimals);

export function toOrderDto(o: Order, spec: InstrumentSpec): OrderDto {
  return {
    id: o.id,
    clientOrderId: o.clientOrderId,
    symbol: spec.symbol,
    side: o.side,
    type: o.type,
    qty: q(o.qty, spec),
    limitPrice: px(o.limitPrice, spec),
    stopPrice: px(o.stopPrice, spec),
    slPrice: px(o.slPrice, spec),
    tpPrice: px(o.tpPrice, spec),
    leverage: o.leverage,
    reduceOnly: o.reduceOnly,
    status: o.status,
    filledQty: q(o.filledQty, spec),
    avgFillPrice: px(o.avgFillPrice, spec),
    rejectCode: o.rejectCode,
    source: o.source,
    createdAt: o.createdAt.toISOString(),
    updatedAt: o.updatedAt.toISOString(),
  };
}

export function toFillDto(f: Fill, spec: InstrumentSpec): FillDto {
  return {
    id: f.id,
    orderId: f.orderId,
    symbol: spec.symbol,
    side: f.side,
    qty: q(f.qty, spec),
    price: px(f.price, spec)!,
    commissionMinor: f.commissionMinor.toString(),
    realizedPnlMinor: f.realizedPnlMinor.toString(),
    executedAt: f.executedAt.toISOString(),
  };
}

export function toLedgerDto(l: LedgerEntry): LedgerEntryDto {
  return {
    id: l.id.toString(),
    type: l.type,
    amountMinor: l.amountMinor.toString(),
    balanceAfterMinor: l.balanceAfterMinor.toString(),
    createdAt: l.createdAt.toISOString(),
  };
}

export type PositionRow = Position;
