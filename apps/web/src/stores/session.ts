import { create } from 'zustand';

export interface SessionUser {
  id: string;
  email: string;
  roles: string[];
  locale: string;
  country: string;
  emailVerified: boolean;
  twoFactorEnabled: boolean;
  /** Admin-panel role in the firm (null = trader only). */
  firmRole?: 'OWNER' | 'ADMIN' | 'SUPPORT' | null;
}

interface AuthPayload {
  accessToken: string;
  expiresIn: number;
  user: SessionUser;
}

type Status = 'unknown' | 'authenticated' | 'anonymous';

interface SessionState {
  status: Status;
  accessToken: string | null;
  user: SessionUser | null;
  setSession: (p: AuthPayload) => void;
  updateUser: (patch: Partial<SessionUser>) => void;
  clear: () => void;
  /** Exchanges the httpOnly refresh cookie for a new access token. Single-flight. */
  refresh: () => Promise<boolean>;
  logout: () => Promise<void>;
}

const BASE = `${import.meta.env.VITE_API_URL ?? ''}/api/v1`;
let refreshTimer: ReturnType<typeof setTimeout> | undefined;
let inflight: Promise<boolean> | null = null;

/** Access token lives in memory only (never in localStorage); the refresh token is an httpOnly cookie. */
export const useSession = create<SessionState>((set, get) => ({
  status: 'unknown',
  accessToken: null,
  user: null,
  setSession: (p) => {
    set({ status: 'authenticated', accessToken: p.accessToken, user: p.user });
    clearTimeout(refreshTimer);
    // Refresh one minute before expiry.
    refreshTimer = setTimeout(() => void get().refresh(), Math.max(10, p.expiresIn - 60) * 1000);
  },
  updateUser: (patch) => {
    const u = get().user;
    if (u) set({ user: { ...u, ...patch } });
  },
  clear: () => {
    clearTimeout(refreshTimer);
    set({ status: 'anonymous', accessToken: null, user: null });
  },
  refresh: () => {
    inflight ??= (async () => {
      try {
        const res = await fetch(`${BASE}/auth/refresh`, { method: 'POST', credentials: 'include' });
        if (!res.ok) {
          get().clear();
          return false;
        }
        get().setSession((await res.json()) as AuthPayload);
        return true;
      } catch {
        // Network error: keep the current state; callers can retry.
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
