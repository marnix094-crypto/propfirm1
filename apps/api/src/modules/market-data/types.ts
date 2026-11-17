export const TIMEFRAMES = ['1m', '5m', '15m', '1h', '4h', '1d'] as const;
export type Timeframe = (typeof TIMEFRAMES)[number];
export const TIMEFRAME_MS: Record<Timeframe, number> = {
  '1m': 60_000,
  '5m': 300_000,
  '15m': 900_000,
  '1h': 3_600_000,
  '4h': 14_400_000,
  '1d': 86_400_000,
};

/** Normalised feed messages. Prices as exact decimal strings from the source. */
export interface RawQuote {
  symbol: string;
  bid: string;
  ask: string;
  ts: number;
}

export interface RawMark {
  symbol: string;
  markPrice: string;
  /** Decimal string, e.g. "0.00010000". */
  fundingRate: string;
  nextFundingTime: number;
  ts: number;
}

export interface RawCandle {
  symbol: string;
  tf: Timeframe;
  openTime: number;
  o: string;
  h: string;
  l: string;
  c: string;
  v: string;
  closed: boolean;
}

export type FeedStatus = 'connecting' | 'connected' | 'down';

export interface MarketDataHandlers {
  onQuote(q: RawQuote): void;
  onMark(m: RawMark): void;
  onCandle(c: RawCandle): void;
  onStatus(s: FeedStatus): void;
}

/** Every market data source (Binance, Polygon, Databento, simulated…) implements this. */
export interface MarketDataAdapter {
  readonly source: string;
  start(symbols: string[], handlers: MarketDataHandlers): Promise<void>;
  stop(): Promise<void>;
  getCandles(symbol: string, tf: Timeframe, limit: number, endTime?: number): Promise<RawCandle[]>;
}
