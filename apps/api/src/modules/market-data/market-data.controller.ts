import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { toDecimalString } from '@brand/engine';
import { Public } from '../auth/public.decorator.js';
import { MarketDataService } from './market-data.service.js';
import {
  CandleDto,
  CandlesQuery,
  FeedStatusDto,
  InstrumentDto,
  QuoteDto,
  TickerDto,
} from './dto.js';

@ApiTags('market')
@Public()
@Controller()
export class MarketDataController {
  constructor(private readonly md: MarketDataService) {}

  @Get('instruments')
  @ApiOkResponse({ type: [InstrumentDto] })
  instruments(): InstrumentDto[] {
    return this.md.instruments().map((i) => ({
      symbol: i.symbol,
      displayName: i.displayName,
      baseAsset: i.baseAsset,
      quoteAsset: i.quoteAsset,
      priceDecimals: i.priceDecimals,
      qtyDecimals: i.qtyDecimals,
      tickSize: toDecimalString(i.tickSize, i.priceDecimals),
      minQty: toDecimalString(i.minQty, i.qtyDecimals),
      qtyStep: toDecimalString(i.qtyStep, i.qtyDecimals),
      maxLeverage: i.maxLeverage,
      commissionBps: i.commissionBps,
    }));
  }

  @Get('instruments/:symbol/quote')
  @ApiOkResponse({ type: QuoteDto })
  quote(@Param('symbol') symbol: string): QuoteDto {
    const inst = this.md.instrumentBySymbol(symbol);
    const q = this.md.freshQuote(inst.symbol);
    const m = this.md.mark(inst.symbol);
    return {
      symbol: inst.symbol,
      bid: toDecimalString(q.bid, inst.priceDecimals),
      ask: toDecimalString(q.ask, inst.priceDecimals),
      markPrice: m ? toDecimalString(m.markPrice, inst.priceDecimals) : null,
      fundingRate: m ? toDecimalString(m.fundingRate, 8) : null,
      ts: q.ts,
    };
  }

  @Get('instruments/:symbol/candles')
  @ApiOkResponse({ type: [CandleDto] })
  async candles(@Param('symbol') symbol: string, @Query() q: CandlesQuery): Promise<CandleDto[]> {
    const rows = await this.md.candles(symbol, q.tf, q.limit);
    return rows.map((c) => ({
      t: c.openTime,
      o: c.o,
      h: c.h,
      l: c.l,
      c: c.c,
      v: c.v,
      closed: c.closed,
    }));
  }

  @Get('market/tickers')
  @ApiOkResponse({ type: [TickerDto] })
  async tickers(): Promise<TickerDto[]> {
    const rows = await this.md.tickers();
    return rows.map((t) => {
      const d = this.md.instrumentBySymbol(t.symbol).priceDecimals;
      const fmt = (v: bigint | null) => (v === null ? null : toDecimalString(v, d));
      const changeBps =
        t.last !== null && t.open24h !== null && t.open24h > 0n
          ? Number(((t.last - t.open24h) * 10_000n) / t.open24h)
          : null;
      return {
        symbol: t.symbol,
        last: fmt(t.last),
        open24h: fmt(t.open24h),
        changeBps,
        high24h: fmt(t.high24h),
        low24h: fmt(t.low24h),
      };
    });
  }

  @Get('market/status')
  @ApiOkResponse({ type: FeedStatusDto })
  status(): FeedStatusDto {
    return this.md.status();
  }
}
