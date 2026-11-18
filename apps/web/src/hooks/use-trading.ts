import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { call, client, uid, type Account, type Order, type PlaceOrder } from '@/lib/api-client';
import { useSession } from '@/stores/session';
import { useTradingUi } from '@/stores/trading';

export const qk = {
  accounts: ['accounts'] as const,
  account: (id: string) => ['account', id] as const,
  positions: (id: string) => ['positions', id] as const,
  orders: (id: string, status: 'open' | 'history') => ['orders', id, status] as const,
  fills: (id: string) => ['fills', id] as const,
  equity: (id: string, range: string) => ['equity', id, range] as const,
  instruments: ['instruments'] as const,
  tickers: ['tickers'] as const,
  candles: (symbol: string, tf: string) => ['candles', symbol, tf] as const,
  watchlist: ['watchlist'] as const,
  rules: (id: string) => ['rules', id] as const,
  config: ['client-config'] as const,
  sessions: ['sessions'] as const,
};

const useAuthed = () => useSession((s) => s.status === 'authenticated');

export function useAccounts() {
  return useQuery({
    queryKey: qk.accounts,
    queryFn: () => call(() => client.GET('/api/v1/accounts')),
    enabled: useAuthed(),
  });
}

/** The active account: the stored choice if it still exists, else the first account. */
export function useActiveAccount(): {
  account: Account | undefined;
  isPending: boolean;
  isError: boolean;
  refetch: () => void;
} {
  const accounts = useAccounts();
  const activeId = useTradingUi((s) => s.activeAccountId);
  const list = accounts.data ?? [];
  const account = list.find((a) => a.id === activeId) ?? list[0];
  const live = useQuery({
    queryKey: qk.account(account?.id ?? 'none'),
    queryFn: () =>
      call(() => client.GET('/api/v1/accounts/{id}', { params: { path: { id: account!.id } } })),
    enabled: !!account,
    initialData: account,
  });
  return {
    account: live.data ?? account,
    isPending: accounts.isPending,
    isError: accounts.isError,
    refetch: () => void accounts.refetch(),
  };
}

export function usePositions(accountId: string | undefined) {
  return useQuery({
    queryKey: qk.positions(accountId ?? 'none'),
    queryFn: () =>
      call(() =>
        client.GET('/api/v1/accounts/{id}/positions', { params: { path: { id: accountId! } } }),
      ),
    enabled: !!accountId,
    refetchInterval: 5000, // re-mark PnL even when no account events arrive
  });
}

export function useOrders(accountId: string | undefined, status: 'open' | 'history') {
  return useQuery({
    queryKey: qk.orders(accountId ?? 'none', status),
    queryFn: () =>
      call(() =>
        client.GET('/api/v1/accounts/{id}/orders', {
          params: { path: { id: accountId! }, query: { status } },
        }),
      ),
    enabled: !!accountId,
  });
}

export function useFills(accountId: string | undefined) {
  return useQuery({
    queryKey: qk.fills(accountId ?? 'none'),
    queryFn: () =>
      call(() =>
        client.GET('/api/v1/accounts/{id}/fills', { params: { path: { id: accountId! } } }),
      ),
    enabled: !!accountId,
  });
}

export type EquityRange = '1D' | '1W' | '1M' | '3M' | '6M' | '1Y';
export function useEquity(accountId: string | undefined, range: EquityRange) {
  return useQuery({
    queryKey: qk.equity(accountId ?? 'none', range),
    queryFn: () =>
      call(() =>
        client.GET('/api/v1/accounts/{id}/equity', {
          params: { path: { id: accountId! }, query: { range } },
        }),
      ),
    enabled: !!accountId,
    placeholderData: keepPreviousData,
  });
}

export function useInstruments() {
  return useQuery({
    queryKey: qk.instruments,
    queryFn: () => call(() => client.GET('/api/v1/instruments')),
    staleTime: 60 * 60_000,
  });
}

export function useTickers() {
  return useQuery({
    queryKey: qk.tickers,
    queryFn: () => call(() => client.GET('/api/v1/market/tickers')),
    refetchInterval: 30_000,
  });
}

export type Timeframe = '1m' | '5m' | '15m' | '1h' | '4h' | '1d';
export function useCandles(symbol: string, tf: Timeframe) {
  return useQuery({
    queryKey: qk.candles(symbol, tf),
    queryFn: () =>
      call(() =>
        client.GET('/api/v1/instruments/{symbol}/candles', {
          params: { path: { symbol }, query: { tf, limit: 500 } },
        }),
      ),
    staleTime: 30_000,
  });
}

export function useWatchlist() {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: qk.watchlist,
    queryFn: () => call(() => client.GET('/api/v1/me/watchlist')),
    enabled: useAuthed(),
  });
  const save = useMutation({
    mutationFn: (symbols: string[]) =>
      call(() => client.PUT('/api/v1/me/watchlist', { body: { symbols } })),
    onMutate: async (symbols) => {
      await qc.cancelQueries({ queryKey: qk.watchlist });
      const prev = qc.getQueryData(qk.watchlist);
      qc.setQueryData(qk.watchlist, { symbols });
      return { prev };
    },
    onError: (_e, _v, ctx) => qc.setQueryData(qk.watchlist, ctx?.prev),
    onSettled: () => void qc.invalidateQueries({ queryKey: qk.watchlist }),
  });
  const symbols = query.data?.symbols ?? [];
  const toggle = (symbol: string) =>
    save.mutate(
      symbols.includes(symbol) ? symbols.filter((s) => s !== symbol) : [...symbols, symbol],
    );
  return { symbols, isPending: query.isPending, toggle };
}

export function invalidateTrading(qc: ReturnType<typeof useQueryClient>, accountId: string) {
  for (const key of [
    qk.positions(accountId),
    ['orders', accountId],
    qk.fills(accountId),
    qk.account(accountId),
    qk.accounts,
    ['equity', accountId],
    qk.rules(accountId),
  ]) {
    void qc.invalidateQueries({ queryKey: key });
  }
}

/** Places an order with an optimistic PENDING row; the server response/WS event confirms it. */
export function usePlaceOrder(accountId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Omit<PlaceOrder, 'clientOrderId'> & { clientOrderId?: string }) => {
      const clientOrderId = body.clientOrderId ?? uid();
      const key = uid();
      return call(() =>
        client.POST('/api/v1/accounts/{id}/orders', {
          params: { path: { id: accountId! }, header: { 'Idempotency-Key': key } },
          body: { ...body, clientOrderId },
        }),
      );
    },
    onMutate: async (body) => {
      if (!accountId || body.type === 'MARKET') return;
      const key = qk.orders(accountId, 'open');
      await qc.cancelQueries({ queryKey: key });
      const optimistic: Order = {
        id: `pending-${uid()}`,
        clientOrderId: 'pending',
        symbol: body.symbol,
        side: body.side,
        type: body.type,
        qty: body.qty,
        limitPrice: body.limitPrice ?? null,
        stopPrice: body.stopPrice ?? null,
        slPrice: body.slPrice ?? null,
        tpPrice: body.tpPrice ?? null,
        leverage: body.leverage,
        reduceOnly: body.reduceOnly ?? false,
        status: 'PENDING',
        filledQty: '0',
        avgFillPrice: null,
        rejectCode: null,
        source: 'USER',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      qc.setQueryData<Order[]>(key, (old) => [optimistic, ...(old ?? [])]);
    },
    onSettled: () => accountId && invalidateTrading(qc, accountId),
  });
}

export function useCancelOrder(accountId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (orderId: string) =>
      call(() =>
        client.DELETE('/api/v1/accounts/{id}/orders/{orderId}', {
          params: { path: { id: accountId!, orderId } },
        }),
      ),
    onSettled: () => accountId && invalidateTrading(qc, accountId),
  });
}

export function useClosePosition(accountId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ positionId, qty }: { positionId: string; qty?: string }) =>
      call(() =>
        client.POST('/api/v1/accounts/{id}/positions/{positionId}/close', {
          params: { path: { id: accountId!, positionId } },
          body: qty ? { qty } : {},
        }),
      ),
    onSettled: () => accountId && invalidateTrading(qc, accountId),
  });
}

export function useUpdatePosition(accountId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      positionId,
      slPrice,
      tpPrice,
    }: {
      positionId: string;
      slPrice: string | null;
      tpPrice: string | null;
    }) =>
      call(() =>
        client.PATCH('/api/v1/accounts/{id}/positions/{positionId}', {
          params: { path: { id: accountId!, positionId } },
          body: { slPrice, tpPrice },
        }),
      ),
    onSettled: () => accountId && invalidateTrading(qc, accountId),
  });
}

export function useResetDemo(accountId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      call(() =>
        client.POST('/api/v1/accounts/{id}/reset', { params: { path: { id: accountId! } } }),
      ),
    onSettled: () => accountId && invalidateTrading(qc, accountId),
  });
}

export function useRules(accountId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: qk.rules(accountId ?? 'none'),
    queryFn: () =>
      call(() =>
        client.GET('/api/v1/accounts/{id}/rules', { params: { path: { id: accountId! } } }),
      ),
    enabled: !!accountId && enabled,
  });
}

export function useClientConfig() {
  return useQuery({
    queryKey: qk.config,
    queryFn: () => call(() => client.GET('/api/v1/config')),
    staleTime: Infinity,
  });
}

/** DEV ONLY: create the example funded account and switch to it. */
export function useCreateExampleFunded() {
  const qc = useQueryClient();
  const setActive = useTradingUi((s) => s.setActiveAccount);
  return useMutation({
    mutationFn: () => call(() => client.POST('/api/v1/dev/example-funded-account')),
    onSuccess: (r) => {
      setActive(r.id);
      void qc.invalidateQueries({ queryKey: qk.accounts });
    },
  });
}
