import type { MarketDataAdapter, MarketDataHandlers, RawCandle, Timeframe } from './types.js';
import { TIMEFRAME_MS } from './types.js';

interface SimInstrument {
  symbol: string;
  priceDecimals: number;
  referencePrice: string;
}

/** Deterministic PRNG (mulberry32) so history is reproducible per symbol/timeframe. */
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

/**
 * Simulated feed for development and CI (no external network). Random walk with a small
 * spread, quoting every `intervalMs`. Clearly a SIMULATION — never used in production.
 */
export class SimulatedAdapter implements MarketDataAdapter {
  readonly source = 'simulated';
  private timer: NodeJS.Timeout | null = null;
  private readonly mids = new Map<string, number>();
  private readonly current1m = new Map<string, RawCandle>();
  private readonly rand = rng(42);

  constructor(
    private readonly instruments: SimInstrument[],
    private readonly intervalMs = 250,
    private readonly now: () => number = Date.now,
  ) {
    for (const i of instruments) this.mids.set(i.symbol, Number(i.referencePrice));
  }

  private fmt(symbol: string, value: number): string {
    const d = this.instruments.find((i) => i.symbol === symbol)!.priceDecimals;
    return value.toFixed(d);
  }

  /** One step of the random walk (exposed for tests). */
  tick(handlers: MarketDataHandlers) {
    const ts = this.now();
    for (const inst of this.instruments) {
      const prev = this.mids.get(inst.symbol)!;
      const mid = Math.max(prev * (1 + (this.rand() - 0.5) * 0.0008), 10 ** -inst.priceDecimals);
      this.mids.set(inst.symbol, mid);
      const tick = 10 ** -inst.priceDecimals;
      const half = Math.max(tick, mid * 0.00002);
      handlers.onQuote({
        symbol: inst.symbol,
        bid: this.fmt(inst.symbol, mid - half),
        ask: this.fmt(inst.symbol, mid + half),
        ts,
      });

      const openTime = ts - (ts % TIMEFRAME_MS['1m']);
      const c = this.current1m.get(inst.symbol);
      const price = this.fmt(inst.symbol, mid);
      if (!c || c.openTime !== openTime) {
        if (c) handlers.onCandle({ ...c, closed: true });
        this.current1m.set(inst.symbol, {
          symbol: inst.symbol,
          tf: '1m',
          openTime,
          o: price,
          h: price,
          l: price,
          c: price,
          v: '0',
          closed: false,
        });
      } else {
        const n = Number(price);
        c.h = Number(c.h) < n ? price : c.h;
        c.l = Number(c.l) > n ? price : c.l;
        c.c = price;
        c.v = (Number(c.v) + this.rand() * 2).toFixed(3);
        handlers.onCandle({ ...c });
      }
    }
    if (ts % 1000 < this.intervalMs) {
      for (const inst of this.instruments) {
        handlers.onMark({
          symbol: inst.symbol,
          markPrice: this.fmt(inst.symbol, this.mids.get(inst.symbol)!),
          fundingRate: '0.00010000',
          nextFundingTime: ts - (ts % 28_800_000) + 28_800_000,
          ts,
        });
      }
    }
  }

  async start(_symbols: string[], handlers: MarketDataHandlers): Promise<void> {
    handlers.onStatus('connected');
    this.tick(handlers);
    this.timer = setInterval(() => this.tick(handlers), this.intervalMs);
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
  }

  /** Synthetic history: walks backwards from the current price, deterministic per symbol/tf/bucket. */
  async getCandles(
    symbol: string,
    tf: Timeframe,
    limit: number,
    endTime?: number,
  ): Promise<RawCandle[]> {
    const inst = this.instruments.find((i) => i.symbol === symbol);
    if (!inst) return [];
    const step = TIMEFRAME_MS[tf];
    const end = endTime ?? this.now();
    const lastOpen = end - (end % step);
    const r = rng(hash(`${symbol}:${tf}:${Math.floor(lastOpen / (step * 1000))}`));
    const vol = 0.002 * Math.sqrt(step / 60_000);
    let close = this.mids.get(symbol)!;
    const out: RawCandle[] = [];
    for (let i = 0; i < limit; i++) {
      const openTime = lastOpen - i * step;
      const open = close * (1 + (r() - 0.5) * vol);
      const high = Math.max(open, close) * (1 + r() * vol * 0.5);
      const low = Math.min(open, close) * (1 - r() * vol * 0.5);
      out.push({
        symbol,
        tf,
        openTime,
        o: this.fmt(symbol, open),
        h: this.fmt(symbol, high),
        l: this.fmt(symbol, low),
        c: this.fmt(symbol, close),
        v: (r() * 100).toFixed(3),
        closed: i > 0,
      });
      close = open;
    }
    return out.reverse();
  }
}
