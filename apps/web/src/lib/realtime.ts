import { io, type Socket } from 'socket.io-client';
import type { QueryClient } from '@tanstack/react-query';
import { useSession } from '@/stores/session';
import { useConnection, useQuotes } from '@/stores/trading';
import { invalidateTrading, qk } from '@/hooks/use-trading';
import type { Account } from './api-client';

const ORIGIN = import.meta.env.VITE_API_URL || window.location.origin;
const PATH = '/api/v1/ws';

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

type CandleListener = (c: LiveCandle) => void;

/**
 * Socket.IO connections with automatic reconnect (exponential backoff + jitter, built in).
 * After every (re)connect the client re-subscribes and receives a fresh snapshot (resync).
 */
class Realtime {
  private market?: Socket;
  private account?: Socket;
  private symbolRefs = new Map<string, number>();
  private candleListeners = new Set<CandleListener>();
  private accountId: string | null = null;
  private lastSeq = 0n;
  private qc?: QueryClient;

  init(qc: QueryClient) {
    this.qc = qc;
  }

  // ---------------------------------------------------------------- market
  private ensureMarket() {
    if (this.market) return this.market;
    const s = io(`${ORIGIN}/market`, {
      path: PATH,
      transports: ['websocket'],
      reconnectionDelayMax: 30_000,
    });
    const conn = useConnection.getState();
    conn.set('market', 'connecting');
    s.on('connect', () => {
      useConnection.getState().set('market', 'connected');
      this.resubscribeSymbols();
    });
    s.on('disconnect', () => useConnection.getState().set('market', 'disconnected'));
    s.on('connect_error', () => useConnection.getState().set('market', 'disconnected'));
    s.on('quote', (q: { s: string; bid: string; ask: string; ts: number }) =>
      useQuotes.getState().put(q.s, q),
    );
    s.on('candle', (c: LiveCandle) => this.candleListeners.forEach((l) => l(c)));
    this.market = s;
    return s;
  }

  private resubscribeSymbols() {
    this.market?.emit('subscribe', { symbols: [...this.symbolRefs.keys()] });
  }

  /** Ref-counted symbol subscription. Returns an unsubscribe function. */
  watchSymbols(symbols: string[]): () => void {
    this.ensureMarket();
    for (const s of symbols) this.symbolRefs.set(s, (this.symbolRefs.get(s) ?? 0) + 1);
    this.resubscribeSymbols();
    return () => {
      for (const s of symbols) {
        const n = (this.symbolRefs.get(s) ?? 1) - 1;
        if (n <= 0) this.symbolRefs.delete(s);
        else this.symbolRefs.set(s, n);
      }
      this.resubscribeSymbols();
    };
  }

  onCandle(l: CandleListener): () => void {
    this.candleListeners.add(l);
    return () => this.candleListeners.delete(l);
  }

  // ---------------------------------------------------------------- account
  watchAccount(accountId: string): () => void {
    this.accountId = accountId;
    if (!this.account) {
      const s = io(`${ORIGIN}/account`, {
        path: PATH,
        transports: ['websocket'],
        reconnectionDelayMax: 30_000,
        // Function form: every reconnect uses the current (refreshed) access token.
        auth: (cb) => cb({ token: useSession.getState().accessToken }),
      });
      useConnection.getState().set('account', 'connecting');
      s.on('connect', () => {
        useConnection.getState().set('account', 'connected');
        void this.subscribeAccount();
      });
      s.on('disconnect', () => useConnection.getState().set('account', 'disconnected'));
      s.on('connect_error', () => useConnection.getState().set('account', 'disconnected'));
      s.on('auth.error', () => void useSession.getState().refresh());
      for (const type of ['order.update', 'position.update', 'fill', 'account.status']) {
        s.on(type, (e: { accountId: string; seq: string }) => this.onPersistedEvent(e));
      }
      s.on(
        'rule.progress',
        (e: {
          accountId: string;
          data: { breach: string | null; passed: boolean; rules: unknown[] };
        }) => {
          this.qc?.setQueryData(
            qk.rules(e.accountId),
            (old: Record<string, unknown> | undefined) => (old ? { ...old, ...e.data } : old),
          );
        },
      );
      s.on('account.update', (e: { accountId: string; data: Partial<Account> }) => {
        this.qc?.setQueryData<Account>(qk.account(e.accountId), (old) =>
          old ? { ...old, ...e.data } : old,
        );
      });
      this.account = s;
    } else if (this.account.connected) {
      void this.subscribeAccount();
    }
    return () => {
      if (this.accountId === accountId) this.accountId = null;
    };
  }

  private async subscribeAccount() {
    if (!this.account || !this.accountId) return;
    const id = this.accountId;
    const snap = (await this.account.emitWithAck('subscribe', { accountId: id })) as {
      ok: boolean;
      seq?: string;
      account?: Account;
    };
    if (!snap.ok || id !== this.accountId) return;
    this.lastSeq = BigInt(snap.seq ?? '0');
    if (snap.account) this.qc?.setQueryData(qk.account(id), snap.account);
    if (this.qc) invalidateTrading(this.qc, id);
  }

  private onPersistedEvent(e: { accountId: string; seq: string }) {
    if (e.accountId !== this.accountId || !this.qc) return;
    const seq = BigInt(e.seq);
    if (seq > this.lastSeq + 1n) {
      // Gap: missed events → full resync.
      void this.subscribeAccount();
      return;
    }
    if (seq > this.lastSeq) this.lastSeq = seq;
    invalidateTrading(this.qc, e.accountId);
  }

  disconnectAccount() {
    this.account?.disconnect();
    this.account = undefined;
    this.accountId = null;
    useConnection.getState().set('account', 'idle');
  }
}

export const realtime = new Realtime();
