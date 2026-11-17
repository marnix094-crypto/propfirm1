import { describe, expect, it, vi } from 'vitest';
import { BinanceUsdmAdapter, parseStreamMessage, streamNames } from './binance.adapter.js';

// Fixtures follow the documented Binance USDⓈ-M futures payloads.
describe('Binance USDⓈ-M parsing', () => {
  it('parses bookTicker', () => {
    const r = parseStreamMessage({
      stream: 'btcusdt@bookTicker',
      data: {
        e: 'bookTicker',
        u: 400900217,
        E: 1568014460893,
        T: 1568014460891,
        s: 'BTCUSDT',
        b: '67000.10',
        B: '31.21',
        a: '67000.20',
        A: '40.66',
      },
    });
    expect(r.quote).toEqual({
      symbol: 'BTCUSDT',
      bid: '67000.10',
      ask: '67000.20',
      ts: 1568014460891,
    });
  });

  it('parses markPriceUpdate incl. funding', () => {
    const r = parseStreamMessage({
      stream: 'btcusdt@markPrice@1s',
      data: {
        e: 'markPriceUpdate',
        E: 1562305380000,
        s: 'BTCUSDT',
        p: '11794.15000000',
        i: '11784.62659091',
        P: '11784.25641265',
        r: '0.00038167',
        T: 1562306400000,
      },
    });
    expect(r.mark).toEqual({
      symbol: 'BTCUSDT',
      markPrice: '11794.15000000',
      fundingRate: '0.00038167',
      nextFundingTime: 1562306400000,
      ts: 1562305380000,
    });
  });

  it('parses kline', () => {
    const r = parseStreamMessage({
      stream: 'btcusdt@kline_1m',
      data: {
        e: 'kline',
        E: 1,
        s: 'BTCUSDT',
        k: {
          t: 1000,
          T: 1999,
          s: 'BTCUSDT',
          i: '1m',
          o: '1.0',
          c: '2.0',
          h: '3.0',
          l: '0.5',
          v: '10',
          x: true,
        },
      },
    });
    expect(r.candle).toMatchObject({
      tf: '1m',
      openTime: 1000,
      o: '1.0',
      h: '3.0',
      l: '0.5',
      c: '2.0',
      closed: true,
    });
  });

  it('ignores unknown events', () => {
    expect(parseStreamMessage({ stream: 'x', data: { e: 'aggTrade' } })).toEqual({});
  });

  it('builds the combined stream list', () => {
    expect(streamNames(['BTCUSDT'])).toEqual([
      'btcusdt@bookTicker',
      'btcusdt@markPrice@1s',
      'btcusdt@kline_1m',
    ]);
  });

  it('fetches REST klines', async () => {
    const fetchFn = vi.fn(
      async () =>
        new Response(
          JSON.stringify([[1000, '1.0', '3.0', '0.5', '2.0', '10', 1999, '0', 1, '0', '0', '0']]),
        ),
    ) as unknown as typeof fetch;
    const rows = await new BinanceUsdmAdapter(fetchFn).getCandles('BTCUSDT', '1h', 1);
    expect(rows[0]).toMatchObject({ openTime: 1000, o: '1.0', h: '3.0', closed: true });
    expect((fetchFn as unknown as { mock: { calls: string[][] } }).mock.calls[0]![0]).toContain(
      'interval=1h',
    );
  });
});
