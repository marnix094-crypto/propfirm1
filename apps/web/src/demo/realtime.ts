import type { QueryClient } from '@tanstack/react-query';
import { toDecimalString } from '@brand/engine';
import type { LiveCandle, RealtimeLike } from '@/lib/realtime';
import { useConnection, useQuotes } from '@/stores/trading';
import { invalidateTrading } from '@/hooks/use-trading';
import { bySymbol } from './market';
import { market, onTick } from './backend';

/** Demo realtime: local price simulator instead of Socket.IO. */
export class DemoRealtime implements RealtimeLike {
  private qc?: QueryClient;
  private listeners = new Set<(c: LiveCandle) => void>();
  private accountId: string | null = null;
  private n = 0;

  init(qc: QueryClient) {
    this.qc = qc;
    useConnection.getState().set('market', 'connected');
    setInterval(() => this.tick(), 500);
    this.tick();
  }

  private tick() {
    for (const { symbol, quote, candle } of market.tick()) {
      const d = bySymbol.get(symbol)!.priceDecimals;
      useQuotes.getState().put(symbol, {
        bid: toDecimalString(quote.bid, d),
        ask: toDecimalString(quote.ask, d),
        ts: quote.ts,
      });
      for (const l of this.listeners) l(candle);
    }
    onTick();
    // Refresh account-derived queries ~1×/s (the real app gets these via WebSocket events).
    if (this.accountId && this.qc && ++this.n % 2 === 0) invalidateTrading(this.qc, this.accountId);
  }

  watchSymbols() {
    return () => {};
  }
  onCandle(l: (c: LiveCandle) => void) {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }
  watchAccount(accountId: string) {
    this.accountId = accountId;
    useConnection.getState().set('account', 'connected');
    return () => {
      if (this.accountId === accountId) this.accountId = null;
    };
  }
  disconnectAccount() {
    this.accountId = null;
  }
}
