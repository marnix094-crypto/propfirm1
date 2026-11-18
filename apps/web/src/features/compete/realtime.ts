import { io, type Socket } from 'socket.io-client';
import type { QueryClient } from '@tanstack/react-query';
import { useCompeteSession } from './session';
import { ck } from './hooks';
import type { CompeteLeaderboard } from './api';

const ORIGIN = import.meta.env.VITE_API_URL || window.location.origin;

/**
 * Compete stream (namespace `/compete`, player token). Reconnects with backoff; after every
 * (re)connect it re-subscribes and gets a fresh leaderboard (resync). In the demo preview
 * there is no socket: queries poll instead.
 */
class CompeteRealtime {
  private socket?: Socket;
  private roundId: string | null = null;
  private qc?: QueryClient;
  connected = false;
  private listeners = new Set<(c: boolean) => void>();

  onStatus(l: (c: boolean) => void): () => void {
    this.listeners.add(l);
    return () => {
      this.listeners.delete(l);
    };
  }
  private setConnected(c: boolean) {
    this.connected = c;
    for (const l of this.listeners) l(c);
  }

  watchRound(qc: QueryClient, roundId: string): () => void {
    if (import.meta.env.VITE_DEMO_MODE === 'true') return () => {};
    this.qc = qc;
    this.roundId = roundId;
    const s = this.ensure();
    if (s.connected) this.subscribe();
    return () => {
      if (this.roundId === roundId) this.roundId = null;
    };
  }

  private ensure(): Socket {
    if (this.socket) return this.socket;
    const s = io(`${ORIGIN}/compete`, {
      path: '/api/v1/ws',
      transports: ['websocket'],
      reconnectionDelayMax: 30_000,
      auth: (cb) => cb({ token: useCompeteSession.getState().accessToken }),
    });
    s.on('connect', () => {
      this.setConnected(true);
      this.subscribe();
    });
    s.on('disconnect', () => this.setConnected(false));
    s.on('auth.error', () => void useCompeteSession.getState().refresh());
    s.on('leaderboard', (lb: CompeteLeaderboard) => {
      this.qc?.setQueryData(ck.leaderboard(lb.roundId), lb);
    });
    s.on('round.update', () => this.invalidate());
    s.on('entry.update', () => this.invalidate());
    this.socket = s;
    return s;
  }

  private invalidate() {
    void this.qc?.invalidateQueries({ queryKey: ck.all });
  }

  private subscribe() {
    if (!this.socket || !this.roundId) return;
    this.socket.emit(
      'subscribe',
      { roundId: this.roundId },
      (ack: { ok: boolean; leaderboard?: CompeteLeaderboard }) => {
        if (ack?.ok && ack.leaderboard)
          this.qc?.setQueryData(ck.leaderboard(ack.leaderboard.roundId), ack.leaderboard);
      },
    );
  }

  disconnect() {
    this.socket?.disconnect();
    this.socket = undefined;
    this.setConnected(false);
  }
}

export const competeRealtime = new CompeteRealtime();
