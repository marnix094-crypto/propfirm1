import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { uid } from '@/lib/api-client';
import { competeCall, competeClient, type CompeteRound } from './api';
import { useCompeteSession } from './session';

/** Query keys of the compete product (own namespace, never shared with platform queries). */
export const ck = {
  all: ['compete'] as const,
  operator: () => ['compete', 'operator'] as const,
  round: (authed: boolean) => ['compete', 'round', authed] as const,
  recent: () => ['compete', 'recent'] as const,
  leaderboard: (roundId: string) => ['compete', 'leaderboard', roundId] as const,
  entry: (id: string) => ['compete', 'entry', id] as const,
  orders: (id: string) => ['compete', 'orders', id] as const,
  history: () => ['compete', 'history'] as const,
};

export function useCompeteOperator() {
  return useQuery({
    queryKey: ck.operator(),
    queryFn: () => competeCall(() => competeClient.GET('/api/v1/compete/operator')),
    staleTime: 5 * 60_000,
  });
}

/** Current round; signed-in players also get their own entry. Polls faster while live. */
export function useCurrentRound() {
  const status = useCompeteSession((s) => s.status);
  const isAuthed = status === 'authenticated';
  return useQuery({
    queryKey: ck.round(isAuthed),
    queryFn: () =>
      isAuthed
        ? competeCall(() => competeClient.GET('/api/v1/compete/me/round'))
        : competeCall(() => competeClient.GET('/api/v1/compete/rounds/current')),
    enabled: status !== 'unknown',
    refetchInterval: (q) => {
      const r = q.state.data as CompeteRound | undefined;
      if (!r) return 15_000;
      const toStart = Date.parse(r.startsAt) - Date.now();
      const toEnd = Date.parse(r.endsAt) - Date.now();
      // Around a transition, poll quickly so the UI flips without a reload.
      if ((toStart > -15_000 && toStart < 5_000) || (toEnd > -15_000 && toEnd < 5_000))
        return 2_000;
      return r.status === 'LIVE' ? 5_000 : 15_000;
    },
  });
}

export function useRecentRounds() {
  return useQuery({
    queryKey: ck.recent(),
    queryFn: () =>
      competeCall(() =>
        competeClient.GET('/api/v1/compete/rounds/recent', { params: { query: { limit: '5' } } }),
      ),
  });
}

export function useLeaderboard(round: CompeteRound | undefined) {
  const isAuthed = useCompeteSession((s) => s.status === 'authenticated');
  return useQuery({
    queryKey: ck.leaderboard(round?.id ?? ''),
    queryFn: () =>
      isAuthed
        ? competeCall(() =>
            competeClient.GET('/api/v1/compete/me/rounds/{id}/leaderboard', {
              params: { path: { id: round!.id } },
            }),
          )
        : competeCall(() =>
            competeClient.GET('/api/v1/compete/rounds/{id}/leaderboard', {
              params: { path: { id: round!.id } },
            }),
          ),
    enabled: !!round && round.status !== 'OPEN',
    // WebSocket pushes every 2 s while live; polling is the fallback (and the demo's source).
    refetchInterval: round?.status === 'LIVE' ? 3_000 : false,
  });
}

export function useEntry(id: string | undefined, live: boolean) {
  return useQuery({
    queryKey: ck.entry(id ?? ''),
    queryFn: () =>
      competeCall(() =>
        competeClient.GET('/api/v1/compete/entries/{id}', { params: { path: { id: id! } } }),
      ),
    enabled: !!id,
    refetchInterval: live ? 1_500 : false,
  });
}

export function useEntryOrders(id: string | undefined) {
  return useQuery({
    queryKey: ck.orders(id ?? ''),
    queryFn: () =>
      competeCall(() =>
        competeClient.GET('/api/v1/compete/entries/{id}/orders', { params: { path: { id: id! } } }),
      ),
    enabled: !!id,
  });
}

export function useHistory() {
  const isAuthed = useCompeteSession((s) => s.status === 'authenticated');
  return useQuery({
    queryKey: ck.history(),
    queryFn: () => competeCall(() => competeClient.GET('/api/v1/compete/me/history')),
    enabled: isAuthed,
  });
}

export function useJoinRound() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (roundId: string) =>
      competeCall(() =>
        competeClient.POST('/api/v1/compete/rounds/{id}/entries', {
          params: { path: { id: roundId }, header: { 'idempotency-key': uid() } },
        }),
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ck.all }),
  });
}

export function useTestPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { entryId: string; outcome: 'succeeded' | 'failed' }) =>
      competeCall(() =>
        competeClient.POST('/api/v1/compete/entries/{id}/test-payment', {
          params: { path: { id: v.entryId }, header: { 'idempotency-key': uid() } },
          body: { outcome: v.outcome },
        }),
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ck.all }),
  });
}

export function usePlaceCompeteOrder(entryId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { symbol: string; side: 'BUY' | 'SELL'; qty: string }) =>
      competeCall(() =>
        competeClient.POST('/api/v1/compete/entries/{id}/orders', {
          params: { path: { id: entryId! }, header: { 'idempotency-key': uid() } },
          body: { clientOrderId: uid().slice(0, 40), ...v },
        }),
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ck.entry(entryId ?? '') });
      void qc.invalidateQueries({ queryKey: ck.orders(entryId ?? '') });
    },
  });
}

export function useClosePosition(entryId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (symbol: string) =>
      competeCall(() =>
        competeClient.POST('/api/v1/compete/entries/{id}/positions/{symbol}/close', {
          params: { path: { id: entryId!, symbol }, header: { 'idempotency-key': uid() } },
        }),
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ck.entry(entryId ?? '') });
      void qc.invalidateQueries({ queryKey: ck.orders(entryId ?? '') });
    },
  });
}
