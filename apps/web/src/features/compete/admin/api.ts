import createClient from 'openapi-fetch';
import { create } from 'zustand';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { components, paths } from '@brand/shared/api';
import { ApiError } from '@/lib/api';

/**
 * Compete admin panel (D104): own client + session. Sends only the compete admin token —
 * never the platform, prop-firm admin or player token.
 */
type S = components['schemas'];
export type CompeteStaff = S['CompeteStaffDto'];
export type AdminOverview = S['CompeteAdminOverviewDto'];
export type AdminRoundSummary = S['CompeteAdminRoundSummaryDto'];
export type AdminRoundDetail = S['CompeteAdminRoundDetailDto'];
export type AdminPlayer = S['CompeteAdminPlayerDto'];
export type AdminPayout = S['CompeteAdminPayoutDto'];
export type AdminSettings = S['CompeteAdminSettingsDto'];
export type AdminOperator = S['CompeteAdminOperatorDto'];
export type AdminIntegration = S['CompeteAdminIntegrationDto'];

const BASE = `${import.meta.env.VITE_API_URL ?? ''}/api/v1/compete/admin`;
const OP_KEY = 'compete-admin-operator';

type Status = 'unknown' | 'authenticated' | 'anonymous';
let timer: ReturnType<typeof setTimeout> | undefined;
let inflight: Promise<boolean> | null = null;

interface AdminSession {
  status: Status;
  accessToken: string | null;
  staff: CompeteStaff | null;
  /** Superadmins: slug of the operator being administered (per tab). */
  operator: string | null;
  setSession: (p: { accessToken: string; expiresIn: number; staff?: CompeteStaff }) => void;
  setStaff: (s: CompeteStaff) => void;
  setOperator: (slug: string) => void;
  clear: () => void;
  refresh: () => Promise<boolean>;
  logout: () => Promise<void>;
}

const readOp = () => {
  try {
    return sessionStorage.getItem(OP_KEY);
  } catch {
    return null;
  }
};

export const useCompeteAdmin = create<AdminSession>((set, get) => ({
  status: 'unknown',
  accessToken: null,
  staff: null,
  operator: readOp(),
  setSession: ({ accessToken, expiresIn, staff }) => {
    set({ status: 'authenticated', accessToken, staff: staff ?? get().staff });
    clearTimeout(timer);
    timer = setTimeout(() => void get().refresh(), Math.max(10, expiresIn - 60) * 1000);
  },
  setStaff: (staff) => set({ staff }),
  setOperator: (slug) => {
    try {
      sessionStorage.setItem(OP_KEY, slug);
    } catch {
      /* per-tab convenience only */
    }
    set({ operator: slug });
  },
  clear: () => {
    clearTimeout(timer);
    set({ status: 'anonymous', accessToken: null, staff: null });
  },
  refresh: () => {
    inflight ??= (async () => {
      try {
        const res = await fetch(`${BASE}/auth/refresh`, { method: 'POST', credentials: 'include' });
        if (!res.ok) {
          get().clear();
          return false;
        }
        const t = (await res.json()) as { accessToken: string; expiresIn: number };
        const me = await fetch(`${BASE}/me`, {
          headers: { Authorization: `Bearer ${t.accessToken}` },
        });
        get().setSession({ ...t, staff: me.ok ? ((await me.json()) as CompeteStaff) : undefined });
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

export const adminClient = createClient<paths>({
  baseUrl: import.meta.env.VITE_API_URL ?? '',
  credentials: 'include',
  fetch: (request) => globalThis.fetch(request),
});

adminClient.use({
  onRequest({ request }) {
    const { accessToken, operator, staff } = useCompeteAdmin.getState();
    if (accessToken) request.headers.set('Authorization', `Bearer ${accessToken}`);
    if (staff?.role === 'SUPERADMIN' && operator)
      request.headers.set('X-Compete-Admin-Operator', operator);
    return request;
  },
});

interface Result<T> {
  data?: T;
  error?: unknown;
  response: Response;
}

export async function adminCall<T>(fn: () => Promise<Result<T>>): Promise<T> {
  let res: Result<T>;
  try {
    res = await fn();
    if (
      res.response.status === 401 &&
      useCompeteAdmin.getState().accessToken &&
      (await useCompeteAdmin.getState().refresh())
    )
      res = await fn();
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(0, 'NETWORK_ERROR', 'Network error');
  }
  if (!res.response.ok) {
    const p = (res.error ?? {}) as { code?: string; title?: string };
    throw new ApiError(
      res.response.status,
      p.code ?? 'HTTP_ERROR',
      p.title ?? res.response.statusText,
    );
  }
  return res.data as T;
}

// ------------------------------------------------------------------ hooks

const op = () => useCompeteAdmin.getState().operator ?? '';
export const ak = {
  all: ['compete-admin'] as const,
  overview: () => ['compete-admin', op(), 'overview'] as const,
  rounds: () => ['compete-admin', op(), 'rounds'] as const,
  round: (id: string) => ['compete-admin', op(), 'round', id] as const,
  players: (q: string) => ['compete-admin', op(), 'players', q] as const,
  payouts: (s: string) => ['compete-admin', op(), 'payouts', s] as const,
  settings: () => ['compete-admin', op(), 'settings'] as const,
  audit: () => ['compete-admin', op(), 'audit'] as const,
  operators: () => ['compete-admin', 'operators'] as const,
};

/** Operator-scoped queries wait until a superadmin picked an operator. */
export function useScopeReady() {
  const staff = useCompeteAdmin((s) => s.staff);
  const operator = useCompeteAdmin((s) => s.operator);
  return !!staff && (staff.role === 'OWNER' || !!operator);
}

export function useOverview() {
  const ready = useScopeReady();
  useCompeteAdmin((s) => s.operator);
  return useQuery({
    queryKey: ak.overview(),
    queryFn: () => adminCall(() => adminClient.GET('/api/v1/compete/admin/overview')),
    enabled: ready,
    refetchInterval: 15_000,
  });
}

export function useAdminRounds() {
  const ready = useScopeReady();
  useCompeteAdmin((s) => s.operator);
  return useQuery({
    queryKey: ak.rounds(),
    queryFn: () => adminCall(() => adminClient.GET('/api/v1/compete/admin/rounds')),
    enabled: ready,
  });
}

export function useAdminRound(id: string | undefined) {
  const ready = useScopeReady();
  return useQuery({
    queryKey: ak.round(id ?? ''),
    queryFn: () =>
      adminCall(() =>
        adminClient.GET('/api/v1/compete/admin/rounds/{id}', { params: { path: { id: id! } } }),
      ),
    enabled: ready && !!id,
  });
}

export function useAdminPlayers(q: string) {
  const ready = useScopeReady();
  useCompeteAdmin((s) => s.operator);
  return useQuery({
    queryKey: ak.players(q),
    queryFn: () =>
      adminCall(() =>
        adminClient.GET('/api/v1/compete/admin/players', { params: { query: { q } } }),
      ),
    enabled: ready,
  });
}

export function usePayouts(status: 'AWAITING_PAYOUT' | 'SUCCEEDED') {
  const ready = useScopeReady();
  useCompeteAdmin((s) => s.operator);
  return useQuery({
    queryKey: ak.payouts(status),
    queryFn: () =>
      adminCall(() =>
        adminClient.GET('/api/v1/compete/admin/payouts', { params: { query: { status } } }),
      ),
    enabled: ready,
  });
}

export function useAdminSettings() {
  const ready = useScopeReady();
  useCompeteAdmin((s) => s.operator);
  return useQuery({
    queryKey: ak.settings(),
    queryFn: () => adminCall(() => adminClient.GET('/api/v1/compete/admin/settings')),
    enabled: ready,
  });
}

export function useAdminIntegration() {
  const ready = useScopeReady();
  useCompeteAdmin((s) => s.operator);
  return useQuery({
    queryKey: ['compete-admin', op(), 'integration'] as const,
    queryFn: () => adminCall(() => adminClient.GET('/api/v1/compete/admin/integration')),
    enabled: ready,
  });
}

export function useAdminAudit() {
  const ready = useScopeReady();
  useCompeteAdmin((s) => s.operator);
  return useQuery({
    queryKey: ak.audit(),
    queryFn: () => adminCall(() => adminClient.GET('/api/v1/compete/admin/audit')),
    enabled: ready,
  });
}

export function useOperators(enabled: boolean) {
  return useQuery({
    queryKey: ak.operators(),
    queryFn: () => adminCall(() => adminClient.GET('/api/v1/compete/admin/operators')),
    enabled,
  });
}

/** Generic mutation that refreshes all admin queries afterwards. */
export function useAdminMutation<V, R>(fn: (v: V) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => qc.invalidateQueries({ queryKey: ak.all }),
  });
}
