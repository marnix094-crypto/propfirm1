import {
  parseDecimalRounded,
  toDecimalString,
  type InstrumentSpec,
  type Quote,
} from '@brand/engine';

/** Demo instrument catalogue (mirrors apps/api instruments.ts). Prices are simulated. */
export interface DemoInstrument extends InstrumentSpec {
  displayName: string;
  baseAsset: string;
  quoteAsset: string;
  ref: number;
}
const costs = {
  spreadMarkupBps: 2,
  commissionBps: 4,
  slippageBaseBps: 1,
  slippageImpactBpsPer100k: 1,
  slippageMaxBps: 10,
};
export const DEMO_INSTRUMENTS: DemoInstrument[] = [
  {
    symbol: 'BTCUSDT',
    displayName: 'Bitcoin',
    baseAsset: 'BTC',
    quoteAsset: 'USDT',
    priceDecimals: 1,
    qtyDecimals: 3,
    tickSize: 1n,
    minQty: 1n,
    qtyStep: 1n,
    maxLeverage: 100,
    ref: 67000,
    ...costs,
  },
  {
    symbol: 'ETHUSDT',
    displayName: 'Ethereum',
    baseAsset: 'ETH',
    quoteAsset: 'USDT',
    priceDecimals: 2,
    qtyDecimals: 3,
    tickSize: 1n,
    minQty: 1n,
    qtyStep: 1n,
    maxLeverage: 100,
    ref: 3480,
    ...costs,
  },
  {
    symbol: 'SOLUSDT',
    displayName: 'Solana',
    baseAsset: 'SOL',
    quoteAsset: 'USDT',
    priceDecimals: 2,
    qtyDecimals: 0,
    tickSize: 1n,
    minQty: 1n,
    qtyStep: 1n,
    maxLeverage: 50,
    ref: 171,
    ...costs,
  },
  {
    symbol: 'XRPUSDT',
    displayName: 'XRP',
    baseAsset: 'XRP',
    quoteAsset: 'USDT',
    priceDecimals: 4,
    qtyDecimals: 1,
    tickSize: 1n,
    minQty: 1n,
    qtyStep: 1n,
    maxLeverage: 50,
    ref: 0.52,
    ...costs,
  },
  {
    symbol: 'BNBUSDT',
    displayName: 'BNB',
    baseAsset: 'BNB',
    quoteAsset: 'USDT',
    priceDecimals: 2,
    qtyDecimals: 2,
    tickSize: 1n,
    minQty: 1n,
    qtyStep: 1n,
    maxLeverage: 50,
    ref: 590,
    ...costs,
  },
  {
    symbol: 'DOGEUSDT',
    displayName: 'Dogecoin',
    baseAsset: 'DOGE',
    quoteAsset: 'USDT',
    priceDecimals: 5,
    qtyDecimals: 0,
    tickSize: 1n,
    minQty: 1n,
    qtyStep: 1n,
    maxLeverage: 50,
    ref: 0.16,
    ...costs,
  },
];
export const bySymbol = new Map(DEMO_INSTRUMENTS.map((i) => [i.symbol, i]));

export const TF_MS: Record<string, number> = {
  '1m': 60_000,
  '5m': 300_000,
  '15m': 900_000,
  '1h': 3_600_000,
  '4h': 14_400_000,
  '1d': 86_400_000,
};

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const hash = (s: string) => [...s].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) | 0, 7);

export interface LiveCandle {
  s: string;
  tf: string;
  t: number;
  o: string;
  h: string;
  l: string;
  c: string;
  v: string;
  closed: boolean;
}

/** In-browser random-walk price feed (display maths may use floats; trading maths uses the engine). */
export class DemoMarket {
  private mids = new Map(DEMO_INSTRUMENTS.map((i) => [i.symbol, i.ref]));
  private candles = new Map<string, LiveCandle>();
  private rand = rng(Date.now() & 0xffff);
  readonly quotes = new Map<string, Quote>();

  fmt(symbol: string, v: number) {
    return v.toFixed(bySymbol.get(symbol)!.priceDecimals);
  }

  tick(): { symbol: string; quote: Quote; candle: LiveCandle }[] {
    const now = Date.now();
    const out: { symbol: string; quote: Quote; candle: LiveCandle }[] = [];
    for (const inst of DEMO_INSTRUMENTS) {
      const prev = this.mids.get(inst.symbol)!;
      const mid = prev * (1 + (this.rand() - 0.5) * 0.0016);
      this.mids.set(inst.symbol, mid);
      const half = Math.max(10 ** -inst.priceDecimals, mid * 0.00002);
      const quote: Quote = {
        bid: parseDecimalRounded(this.fmt(inst.symbol, mid - half), inst.priceDecimals),
        ask: parseDecimalRounded(this.fmt(inst.symbol, mid + half), inst.priceDecimals),
        ts: now,
      };
      this.quotes.set(inst.symbol, quote);
      const t = now - (now % 60_000);
      const p = this.fmt(inst.symbol, mid);
      let c = this.candles.get(inst.symbol);
      if (!c || c.t !== t)
        c = { s: inst.symbol, tf: '1m', t, o: p, h: p, l: p, c: p, v: '0', closed: false };
      else
        c = {
          ...c,
          h: Number(c.h) < mid ? p : c.h,
          l: Number(c.l) > mid ? p : c.l,
          c: p,
          v: (Number(c.v) + this.rand()).toFixed(3),
        };
      this.candles.set(inst.symbol, c);
      out.push({ symbol: inst.symbol, quote, candle: c });
    }
    return out;
  }

  mid(symbol: string): string {
    const q = this.quotes.get(symbol);
    const d = bySymbol.get(symbol)!.priceDecimals;
    return q ? toDecimalString((q.bid + q.ask) / 2n, d) : this.fmt(symbol, this.mids.get(symbol)!);
  }

  /** Synthetic history ending at the current price. */
  history(symbol: string, tf: string, limit: number) {
    const step = TF_MS[tf] ?? 60_000;
    const now = Date.now();
    const last = now - (now % step);
    const r = rng(hash(`${symbol}:${tf}`));
    const vol = 0.002 * Math.sqrt(step / 60_000);
    let close = this.mids.get(symbol)!;
    const rows = [];
    for (let i = 0; i < limit; i++) {
      const open = close * (1 + (r() - 0.5) * vol);
      const high = Math.max(open, close) * (1 + r() * vol * 0.5);
      const low = Math.min(open, close) * (1 - r() * vol * 0.5);
      rows.push({
        t: last - i * step,
        o: this.fmt(symbol, open),
        h: this.fmt(symbol, high),
        l: this.fmt(symbol, low),
        c: this.fmt(symbol, close),
        v: (r() * 100).toFixed(3),
        closed: i > 0,
      });
      close = open;
    }
    return rows.reverse();
  }
}
