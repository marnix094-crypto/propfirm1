import { Logger, type OnModuleDestroy } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  type OnGatewayInit,
} from '@nestjs/websockets';
import type { Namespace, Socket } from 'socket.io';
import type { Subscription } from 'rxjs';
import { toDecimalString } from '@brand/engine';
import { MarketDataService } from '../market-data/market-data.service.js';
import { WS_OPTIONS } from './ws-options.js';

const QUOTE_THROTTLE_MS = 250;
const CANDLE_THROTTLE_MS = 1000;
const MAX_SYMBOLS = 30;

/** Public market data: `subscribe {symbols}` → `quote`, `candle` (1m), `feed.status`. */
@WebSocketGateway({ ...WS_OPTIONS, namespace: '/market' })
export class MarketGateway implements OnGatewayInit, OnModuleDestroy {
  private readonly logger = new Logger(MarketGateway.name);
  @WebSocketServer() server!: Namespace;
  private subs: Subscription[] = [];
  private readonly lastQuote = new Map<string, number>();
  private readonly lastCandle = new Map<string, number>();

  constructor(private readonly md: MarketDataService) {}

  afterInit() {
    this.subs.push(
      this.md.quotes$.subscribe(({ symbol, quote }) => {
        const now = Date.now();
        if (now - (this.lastQuote.get(symbol) ?? 0) < QUOTE_THROTTLE_MS) return;
        this.lastQuote.set(symbol, now);
        const inst = this.md.instrumentBySymbol(symbol);
        this.server.to(`q:${symbol}`).emit('quote', {
          s: symbol,
          bid: toDecimalString(quote.bid, inst.priceDecimals),
          ask: toDecimalString(quote.ask, inst.priceDecimals),
          ts: quote.ts,
        });
      }),
      this.md.candles$.subscribe((c) => {
        const now = Date.now();
        const key = `${c.symbol}:${c.tf}`;
        if (!c.closed && now - (this.lastCandle.get(key) ?? 0) < CANDLE_THROTTLE_MS) return;
        this.lastCandle.set(key, now);
        this.server.to(`q:${c.symbol}`).emit('candle', {
          s: c.symbol,
          tf: c.tf,
          t: c.openTime,
          o: c.o,
          h: c.h,
          l: c.l,
          c: c.c,
          v: c.v,
          closed: c.closed,
        });
      }),
      this.md.status$.subscribe((status) =>
        this.server.emit('feed.status', { source: this.md.status().source, status }),
      ),
    );
  }

  onModuleDestroy() {
    for (const s of this.subs) s.unsubscribe();
  }

  @SubscribeMessage('subscribe')
  subscribe(@ConnectedSocket() socket: Socket, @MessageBody() body: { symbols?: unknown }) {
    const symbols = Array.isArray(body?.symbols)
      ? body.symbols.filter((s): s is string => typeof s === 'string')
      : [];
    const valid = symbols
      .map((s) => s.toUpperCase())
      .filter((s) => this.md.instruments().some((i) => i.symbol === s));
    for (const room of socket.rooms) if (room.startsWith('q:')) void socket.leave(room);
    for (const s of valid.slice(0, MAX_SYMBOLS)) void socket.join(`q:${s}`);
    return { ok: true, symbols: valid, feed: this.md.status() };
  }
}
