import { create } from 'zustand';
import type { components } from '@brand/shared/api';

type Player = components['schemas']['CompetePlayerDto'];
type Status = 'unknown' | 'authenticated' | 'anonymous';

const BASE = `${import.meta.env.VITE_API_URL ?? ''}/api/v1/compete`;
let timer: ReturnType<typeof setTimeout> | undefined;
let inflight: Promise<boolean> | null = null;

function opHeaders(): Record<string, string> {
  try {
    const op = sessionStorage.getItem('compete-operator') ?? import.meta.env.VITE_COMPETE_OPERATOR;
    return op ? { 'X-Compete-Operator': op } : {};
  } catch {
    return {};
  }
}

interface CompeteSessionState {
  status: Status;
  accessToken: string | null;
  player: Player | null;
  setSession: (p: { accessToken: string; expiresIn: number; player?: Player }) => void;
  clear: () => void;
  /** Exchanges the compete refresh cookie (`compete_rt`) for a new access token. Single-flight. */
  refresh: () => Promise<boolean>;
  logout: () => Promise<void>;
}

/**
 * Player session of the Compete product — separate from the platform session (D98).
 * Access token in memory only; the refresh token is an httpOnly cookie scoped to /compete/auth.
 */
export const useCompeteSession = create<CompeteSessionState>((set, get) => ({
  status: 'unknown',
  accessToken: null,
  player: null,
  setSession: ({ accessToken, expiresIn, player }) => {
    set({ status: 'authenticated', accessToken, player: player ?? get().player });
    clearTimeout(timer);
    timer = setTimeout(() => void get().refresh(), Math.max(10, expiresIn - 60) * 1000);
  },
  clear: () => {
    clearTimeout(timer);
    set({ status: 'anonymous', accessToken: null, player: null });
  },
  refresh: () => {
    inflight ??= (async () => {
      try {
        const res = await fetch(`${BASE}/auth/refresh`, {
          method: 'POST',
          credentials: 'include',
          headers: opHeaders(),
        });
        if (!res.ok) {
          get().clear();
          return false;
        }
        const t = (await res.json()) as { accessToken: string; expiresIn: number };
        let player = get().player ?? undefined;
        if (!player) {
          const me = await fetch(`${BASE}/me`, {
            headers: { Authorization: `Bearer ${t.accessToken}`, ...opHeaders() },
          });
          if (me.ok) player = (await me.json()) as Player;
        }
        get().setSession({ ...t, player });
        return true;
      } catch {
        if (get().status === 'unknown') set({ status: 'anonymous' });
        return false;
      } finally {
        inflight = null;
      }
    })();
    return inflight;
  },
  logout: async () => {
    await fetch(`${BASE}/auth/logout`, { method: 'POST', credentials: 'include' }).catch(
      () => undefined,
    );
    get().clear();
  },
}));
