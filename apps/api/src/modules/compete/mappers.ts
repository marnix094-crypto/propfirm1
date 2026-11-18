import {
  accountMetrics,
  competeFloorMinor,
  returnBps,
  toDecimalString,
  unrealizedPnlMinor,
  type InstrumentSpec,
  type MarkedPosition,
  type Quote,
} from '@brand/engine';
import type {
  CompeteEntry,
  CompeteOrder,
  CompetePosition,
  CompeteRound,
} from '../../generated/prisma/client.js';
import type { CompeteEntryDto, CompeteOrderDto, CompeteRoundDto } from './dto.js';

export interface PositionWithSpec {
  row: CompetePosition;
  spec: InstrumentSpec;
  quote: Quote | null;
}

const px = (v: bigint, spec: InstrumentSpec) => toDecimalString(v, spec.priceDecimals);
const qty = (v: bigint, spec: InstrumentSpec) => toDecimalString(v, spec.qtyDecimals);

/** Mark-to-market of an entry. Positions without a quote count at zero open PnL. */
export function entryMetrics(balanceMinor: bigint, positions: PositionWithSpec[]) {
  const marked: MarkedPosition[] = positions
    .filter((p) => p.quote)
    .map((p) => ({
      position: {
        side: p.row.side,
        qty: p.row.qty,
        avgEntryPrice: p.row.avgEntryPrice,
        leverage: p.row.leverage,
      },
      spec: p.spec,
      quote: p.quote!,
    }));
  return accountMetrics(balanceMinor, marked);
}

export function toEntryDto(
  e: CompeteEntry,
  round: Pick<CompeteRound, 'startBalanceMinor' | 'maxDrawdownBps'>,
  positions: PositionWithSpec[],
): CompeteEntryDto {
  const live = e.status === 'ACTIVE';
  const m = entryMetrics(e.balanceMinor, live ? positions : []);
  const equity = live ? m.equityMinor : (e.finalEquityMinor ?? e.balanceMinor);
  return {
    id: e.id,
    roundId: e.roundId,
    status: e.status,
    startBalanceMinor: round.startBalanceMinor.toString(),
    balanceMinor: e.balanceMinor.toString(),
    equityMinor: equity.toString(),
    usedMarginMinor: m.usedMarginMinor.toString(),
    freeMarginMinor: (equity - m.usedMarginMinor).toString(),
    floorMinor: competeFloorMinor(round).toString(),
    returnBps: returnBps(equity, round.startBalanceMinor).toString(),
    rank: e.rank,
    prizeMinor: e.prizeMinor?.toString() ?? null,
    paidAt: e.paidAt?.toISOString() ?? null,
    endedAt: e.endedAt?.toISOString() ?? null,
    positions: positions.map((p) => ({
      symbol: p.spec.symbol,
      side: p.row.side,
      qty: qty(p.row.qty, p.spec),
      avgEntryPrice: px(p.row.avgEntryPrice, p.spec),
      markPrice: p.quote ? px((p.quote.bid + p.quote.ask) / 2n, p.spec) : null,
      unrealizedPnlMinor: (p.quote
        ? unrealizedPnlMinor(
            {
              side: p.row.side,
              qty: p.row.qty,
              avgEntryPrice: p.row.avgEntryPrice,
              leverage: p.row.leverage,
            },
            p.quote,
            p.spec,
          )
        : 0n
      ).toString(),
      leverage: p.row.leverage,
    })),
  };
}

export function toOrderDto(o: CompeteOrder, spec: InstrumentSpec): CompeteOrderDto {
  return {
    id: o.id,
    clientOrderId: o.clientOrderId,
    symbol: spec.symbol,
    side: o.side,
    qty: qty(o.qty, spec),
    price: px(o.price, spec),
    feeMinor: o.feeMinor.toString(),
    realizedPnlMinor: o.realizedPnlMinor.toString(),
    reason: o.reason,
    createdAt: o.createdAt.toISOString(),
  };
}

export function toRoundDto(
  r: CompeteRound,
  participants: number,
  potMinor: bigint,
  prizesMinor: bigint[],
): Omit<CompeteRoundDto, 'myEntry'> {
  return {
    id: r.id,
    status: r.status,
    startsAt: r.startsAt.toISOString(),
    endsAt: r.endsAt.toISOString(),
    entryFeeMinor: r.entryFeeMinor.toString(),
    currency: r.currency,
    startBalanceMinor: r.startBalanceMinor.toString(),
    leverage: r.leverage,
    maxDrawdownBps: r.maxDrawdownBps,
    minParticipants: r.minParticipants,
    prizePoolBps: r.prizePoolBps,
    prizeSplitBps: r.prizeSplitBps,
    participants,
    potMinor: potMinor.toString(),
    prizesMinor: prizesMinor.map(String),
  };
}
