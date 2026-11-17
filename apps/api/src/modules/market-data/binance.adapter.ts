import { Logger } from '@nestjs/common';
import WebSocket from 'ws';
import type {
  FeedStatus,
  MarketDataAdapter,
  MarketDataHandlers,
  RawCandle,
  RawMark,
  RawQuote,
  Timeframe,
} from './types.js';

const WS_BASE = 'wss://fstream.binance.com/stream?streams=';
const REST_BASE = 'https://fapi.binance.com';
/** Binance drops connections after 24h; reconnect a bit earlier. */
const PROACTIVE_RECONNECT_MS = 23 * 60 * 60 * 1000;

type StreamMessage = { stream: string; data: Record<string, unknown> };

export function parseStreamMessage(msg: StreamMessage): {
  quote?: RawQuote;
  mark?: RawMark;
  candle?: RawCandle;
} {
  const d = msg.data;
  switch (d.e) {
    case 'bookTicker':
      return {
        quote: { symbol: String(d.s), bid: String(d.b), ask: String(d.a), ts: Number(d.T ?? d.E) },
      };
    case 'markPriceUpdate':
      return {
        mark: {
          symbol: String(d.s),
          markPrice: String(d.p),
          fundingRate: String(d.r),
          nextFundingTime: Number(d.T),
          ts: Number(d.E),
        },
      };
    case 'kline': {
      const k = d.k as Record<string, unknown>;
      return {
        candle: {
          symbol: String(d.s),
          tf: String(k.i) as Timeframe,
          openTime: Number(k.t),
          o: String(k.o),
          h: String(k.h),
          l: String(k.l),
          c: String(k.c),
          v: String(k.v),
          closed: Boolean(k.x),
        },
      };
    }
    default:
      return {};
  }
}

export function parseRestKline(symbol: string, tf: Timeframe, row: unknown[]): RawCandle {
  return {
    symbol,
    tf,
    openTime: Number(row[0]),
    o: String(row[1]),
    h: String(row[2]),
    l: String(row[3]),
    c: String(row[4]),
    v: String(row[5]),
    closed: Number(row[6]) < Date.now(),
  };
}

export function streamNames(symbols: string[]): string[] {
  return symbols.flatMap((s) => {
    const l = s.toLowerCase();
    return [`${l}@bookTicker`, `${l}@markPrice@1s`, `${l}@kline_1m`];
  });
}

/**
 * Binance USDⓈ-M futures public market data (no API key needed).
 * Note: Binance refuses connections from restricted locations; use the simulated feed there.
 */
export class BinanceUsdmAdapter implements MarketDataAdapter {
  readonly source = 'binance-usdm';
  private readonly logger = new Logger(BinanceUsdmAdapter.name);
  private ws: WebSocket | null = null;
  private stopped = false;
  private attempt = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private proactiveTimer: NodeJS.Timeout | null = null;

  constructor(private readonly fetchFn: typeof fetch = fetch) {}

  async start(symbols: string[], handlers: MarketDataHandlers): Promise<void> {
    this.stopped = false;
    this.connect(symbols, handlers);
  }

  private connect(symbols: string[], h: MarketDataHandlers) {
    h.onStatus('connecting');
    const ws = new WebSocket(WS_BASE + streamNames(symbols).join('/'));
    this.ws = ws;
    ws.on('open', () => {
      this.attempt = 0;
      h.onStatus('connected');
      this.proactiveTimer = setTimeout(() => ws.close(), PROACTIVE_RECONNECT_MS);
    });
    ws.on('message', (raw) => {
      try {
        const parsed = parseStreamMessage(JSON.parse(raw.toString()) as StreamMessage);
        if (parsed.quote) h.onQuote(parsed.quote);
        if (parsed.mark) h.onMark(parsed.mark);
        if (parsed.candle) h.onCandle(parsed.candle);
      } catch (e) {
        this.logger.warn(`Bad message: ${(e as Error).message}`);
      }
    });
    ws.on('error', (e) => this.logger.warn(`WebSocket error: ${e.message}`));
    ws.on('close', () => {
      if (this.proactiveTimer) clearTimeout(this.proactiveTimer);
      if (this.stopped) return;
      h.onStatus(this.attempt > 2 ? 'down' : 'connecting');
      const delay = Math.min(30_000, 1000 * 2 ** this.attempt++) + Math.floor(Math.random() * 500);
      this.reconnectTimer = setTimeout(() => this.connect(symbols, h), delay);
    });
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.proactiveTimer) clearTimeout(this.proactiveTimer);
    this.ws?.close();
  }

  async getCandles(
    symbol: string,
    tf: Timeframe,
    limit: number,
    endTime?: number,
  ): Promise<RawCandle[]> {
    const params = new URLSearchParams({ symbol, interval: tf, limit: String(limit) });
    if (endTime) params.set('endTime', String(endTime));
    const res = await this.fetchFn(`${REST_BASE}/fapi/v1/klines?${params}`);
    if (!res.ok) throw new Error(`Binance klines HTTP ${res.status}`);
    const rows = (await res.json()) as unknown[][];
    return rows.map((r) => parseRestKline(symbol, tf, r));
  }
}

export type { FeedStatus };
