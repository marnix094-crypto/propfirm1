import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationShutdown,
  type OnModuleInit,
} from '@nestjs/common';
import { Subject } from 'rxjs';
import { parseDecimalRounded, type InstrumentSpec, type Quote } from '@brand/engine';
import { APP_CONFIG, type AppConfig } from '../../config/env.js';
import { PrismaService } from '../../infra/prisma.service.js';
import { RedisService } from '../../infra/redis.service.js';
import { Errors } from '../../common/errors.js';
import { BinanceUsdmAdapter } from './binance.adapter.js';
import { SimulatedAdapter } from './simulated.adapter.js';
import { INSTRUMENT_CATALOG } from './instruments.js';
import type { FeedStatus, MarketDataAdapter, RawCandle, RawMark, Timeframe } from './types.js';

export interface InstrumentRecord extends InstrumentSpec {
  id: string;
  displayName: string;
  baseAsset: string;
  quoteAsset: string;
  sortOrder: number;
}

export interface QuoteEvent {
  instrumentId: string;
  symbol: string;
  quote: Quote;
}

export interface MarkInfo {
  markPrice: bigint;
  /** Fixed-point, 8 decimals. */
  fundingRate: bigint;
  nextFundingTime: number;
}

export const MARKET_DATA_ADAPTER = Symbol('MARKET_DATA_ADAPTER');

@Injectable()
export class MarketDataService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(MarketDataService.name);
  private readonly bySymbol = new Map<string, InstrumentRecord>();
  private readonly byId = new Map<string, InstrumentRecord>();
  private readonly quotes = new Map<string, Quote>();
  private readonly marks = new Map<string, MarkInfo>();
  private feedStatus: FeedStatus = 'connecting';

  /** Hot stream of validated quotes (consumed by matcher, risk loop and gateways). */
  readonly quotes$ = new Subject<QuoteEvent>();
  readonly candles$ = new Subject<RawCandle>();
  readonly status$ = new Subject<FeedStatus>();

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(MARKET_DATA_ADAPTER) private readonly adapter: MarketDataAdapter,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async onModuleInit() {
    await this.syncCatalog();
    await this.adapter.start([...this.bySymbol.keys()], {
      onQuote: (q) => this.handleQuote(q.symbol, q.bid, q.ask, q.ts),
      onMark: (m) => this.handleMark(m),
      onCandle: (c) => this.candles$.next(c),
      onStatus: (s) => {
        this.feedStatus = s;
        this.status$.next(s);
        this.logger.log(`Feed ${this.adapter.source}: ${s}`);
      },
    });
  }

  async onApplicationShutdown() {
    await this.adapter.stop();
  }

  /** Upsert the code-defined catalogue so precision/costs are versioned with the code. */
  private async syncCatalog() {
    for (const def of INSTRUMENT_CATALOG) {
      const { simReferencePrice: _ref, ...data } = def;
      const row = await this.prisma.instrument.upsert({
        where: { symbol: def.symbol },
        create: { ...data, externalSymbol: def.symbol },
        update: { ...data, externalSymbol: def.symbol },
      });
      const rec: InstrumentRecord = {
        id: row.id,
        symbol: row.symbol,
        displayName: row.displayName,
        baseAsset: row.baseAsset,
        quoteAsset: row.quoteAsset,
        sortOrder: row.sortOrder,
        priceDecimals: row.priceDecimals,
        qtyDecimals: row.qtyDecimals,
        tickSize: row.tickSize,
        minQty: row.minQty,
        qtyStep: row.qtyStep,
        maxLeverage: row.maxLeverage,
        spreadMarkupBps: row.spreadMarkupBps,
        commissionBps: row.commissionBps,
        slippageBaseBps: row.slippageBaseBps,
        slippageImpactBpsPer100k: row.slippageImpactBpsPer100k,
        slippageMaxBps: row.slippageMaxBps,
      };
      this.bySymbol.set(rec.symbol, rec);
      this.byId.set(rec.id, rec);
    }
  }

  /** Exposed for tests: inject a quote as if it came from the feed. */
  handleQuote(symbol: string, bidStr: string, askStr: string, ts: number) {
    const inst = this.bySymbol.get(symbol);
    if (!inst) return;
    const bid = parseDecimalRounded(bidStr, inst.priceDecimals);
    const ask = parseDecimalRounded(askStr, inst.priceDecimals);
    if (bid <= 0n || ask < bid) return; // drop crossed/invalid books
    const quote: Quote = { bid, ask, ts: Date.now() };
    this.quotes.set(symbol, quote);
    this.quotes$.next({ instrumentId: inst.id, symbol, quote });
    void ts;
  }

  private handleMark(m: RawMark) {
    const inst = this.bySymbol.get(m.symbol);
    if (!inst) return;
    this.marks.set(m.symbol, {
      markPrice: parseDecimalRounded(m.markPrice, inst.priceDecimals),
      fundingRate: parseDecimalRounded(m.fundingRate, 8),
      nextFundingTime: m.nextFundingTime,
    });
  }

  instruments(): InstrumentRecord[] {
    return [...this.bySymbol.values()].sort((a, b) => a.sortOrder - b.sortOrder);
  }

  instrumentBySymbol(symbol: string): InstrumentRecord {
    const i = this.bySymbol.get(symbol.toUpperCase());
    if (!i) throw Errors.notFound('Instrument');
    return i;
  }

  instrumentById(id: string): InstrumentRecord {
    const i = this.byId.get(id);
    if (!i) throw Errors.notFound('Instrument');
    return i;
  }

  /** Latest quote, or null if none/stale. */
  peekQuote(symbol: string): Quote | null {
    const q = this.quotes.get(symbol);
    if (!q || Date.now() - q.ts > this.config.quoteStaleMs) return null;
    return q;
  }

  /** Latest fresh quote; throws MARKET_DATA_STALE so no order fills on old prices. */
  freshQuote(symbol: string): Quote {
    const q = this.peekQuote(symbol);
    if (!q)
      throw Errors.unprocessable('MARKET_DATA_STALE', 'No fresh market data for this instrument');
    return q;
  }

  mark(symbol: string): MarkInfo | null {
    return this.marks.get(symbol) ?? null;
  }

  status() {
    return { source: this.adapter.source, status: this.feedStatus };
  }

  async candles(symbol: string, tf: Timeframe, limit: number): Promise<RawCandle[]> {
    const inst = this.instrumentBySymbol(symbol);
    const key = `candles:${this.adapter.source}:${inst.symbol}:${tf}:${limit}`;
    const cached = await this.redis.client.get(key).catch(() => null);
    if (cached) return JSON.parse(cached) as RawCandle[];
    const rows = await this.adapter.getCandles(inst.symbol, tf, limit);
    await this.redis.client.set(key, JSON.stringify(rows), 'EX', 5).catch(() => undefined);
    return rows;
  }
}

export function createAdapter(config: AppConfig): MarketDataAdapter {
  if (config.marketDataSource === 'binance') return new BinanceUsdmAdapter();
  return new SimulatedAdapter(
    INSTRUMENT_CATALOG.map((i) => ({
      symbol: i.symbol,
      priceDecimals: i.priceDecimals,
      referencePrice: i.simReferencePrice,
    })),
  );
}
