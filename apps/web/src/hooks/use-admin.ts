import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { call, client, type Schemas } from '@/lib/api-client';
import { useSession } from '@/stores/session';
import { useFirmStore } from '@/stores/firm';

export type AdminMe = Schemas['AdminMeDto'];
export type AdminFirm = Schemas['AdminFirmDto'];
export type AdminFirmSummary = Schemas['AdminFirmSummaryDto'];
export type AdminOverview = Schemas['AdminOverviewDto'];
export type AdminTrader = Schemas['AdminTraderDto'];
export type AdminTraderDetail = Schemas['AdminTraderDetailDto'];
export type AdminAccount = Schemas['AdminAccountDto'];
export type AdminProduct = Schemas['AdminProductDto'];
export type AdminRuleSet = Schemas['AdminRuleSetDto'];
export type AdminAlert = Schemas['AdminAlertDto'];
export type AdminAudit = Schemas['AdminAuditDto'];
export type TeamMember = Schemas['TeamMemberDto'];
export type FirmRole = TeamMember['role'];
export type CreateProduct = Schemas['CreateProductDto'];
export type UpdateProduct = Schemas['UpdateProductDto'];
export type CreateRuleSet = Schemas['CreateRuleSetDto'];
export type UpdateBranding = Schemas['UpdateBrandingDto'];
export type AccountKind = AdminAccount['kind'];
export type AccountStatus = AdminAccount['status'];

const useAuthed = () => useSession((s) => s.status === 'authenticated');

/** Every admin query is keyed by the administered firm (superadmins can switch). */
function useAk() {
  const firm = useFirmStore((s) => s.adminFirmId) ?? 'own';
  return (...parts: unknown[]) => ['admin', firm, ...parts];
}

export function useAdminMe() {
  const ak = useAk();
  return useQuery({
    queryKey: ak('me'),
    queryFn: () => call(() => client.GET('/api/v1/admin/me')),
    enabled: useAuthed(),
    retry: false,
  });
}

/** Admin data that only loads once access (incl. 2FA) is confirmed. */
function useReady() {
  const me = useAdminMe().data;
  return !!me && (me.twoFactorEnabled || !me.twoFactorRequired);
}

export function useAdminOverview() {
  const ak = useAk();
  return useQuery({
    queryKey: ak('overview'),
    queryFn: () => call(() => client.GET('/api/v1/admin/overview')),
    enabled: useReady(),
    refetchInterval: 60_000,
  });
}

// ---------------------------------------------------------------- traders
export function useAdminTraders(filter: { q?: string; status?: 'ACTIVE' | 'SUSPENDED' }) {
  const ak = useAk();
  return useInfiniteQuery({
    queryKey: ak('traders', filter),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      call(() =>
        client.GET('/api/v1/admin/traders', {
          params: {
            query: {
              cursor: pageParam,
              limit: 50,
              ...(filter.q ? { q: filter.q } : {}),
              ...(filter.status ? { status: filter.status } : {}),
            },
          },
        }),
      ),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: useReady(),
    placeholderData: keepPreviousData,
  });
}

export function useAdminTrader(id: string | undefined) {
  const ak = useAk();
  return useQuery({
    queryKey: ak('trader', id),
    queryFn: () =>
      call(() => client.GET('/api/v1/admin/traders/{id}', { params: { path: { id: id! } } })),
    enabled: useReady() && !!id,
  });
}

export function useTraderStatus(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ action, reason }: { action: 'suspend' | 'reactivate'; reason: string }) =>
      call(() =>
        action === 'suspend'
          ? client.POST('/api/v1/admin/traders/{id}/suspend', {
              params: { path: { id } },
              body: { reason },
            })
          : client.POST('/api/v1/admin/traders/{id}/reactivate', {
              params: { path: { id } },
              body: { reason },
            }),
      ),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['admin'] }),
  });
}

// ---------------------------------------------------------------- accounts
export function useAdminAccounts(filter: { kind?: AccountKind; status?: AccountStatus }) {
  const ak = useAk();
  return useInfiniteQuery({
    queryKey: ak('accounts', filter),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      call(() =>
        client.GET('/api/v1/admin/accounts', {
          params: { query: { cursor: pageParam, limit: 50, ...filter } },
        }),
      ),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: useReady(),
    placeholderData: keepPreviousData,
  });
}

export function useFailAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      call(() =>
        client.POST('/api/v1/admin/accounts/{id}/fail', {
          params: { path: { id } },
          body: { reason },
        }),
      ),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['admin'] }),
  });
}

// ---------------------------------------------------------------- catalogue
export function useAdminProducts() {
  const ak = useAk();
  return useQuery({
    queryKey: ak('products'),
    queryFn: () => call(() => client.GET('/api/v1/admin/products')),
    enabled: useReady(),
    select: (d) => d.items,
  });
}

export function useAdminRuleSets() {
  const ak = useAk();
  return useQuery({
    queryKey: ak('rule-sets'),
    queryFn: () => call(() => client.GET('/api/v1/admin/rule-sets')),
    enabled: useReady(),
    select: (d) => d.items,
  });
}

function useAdminMutation<A, R>(fn: (a: A) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['admin'] }),
  });
}

export const useCreateProduct = () =>
  useAdminMutation((body: CreateProduct) =>
    call(() => client.POST('/api/v1/admin/products', { body })),
  );

export const useUpdateProduct = () =>
  useAdminMutation(({ id, ...body }: UpdateProduct & { id: string }) =>
    call(() => client.PATCH('/api/v1/admin/products/{id}', { params: { path: { id } }, body })),
  );

export const useCreateRuleSet = () =>
  useAdminMutation((body: CreateRuleSet) =>
    call(() => client.POST('/api/v1/admin/rule-sets', { body })),
  );

// ---------------------------------------------------------------- branding
export function useAdminBranding() {
  const ak = useAk();
  return useQuery({
    queryKey: ak('branding'),
    queryFn: () => call(() => client.GET('/api/v1/admin/branding')),
    enabled: useReady(),
  });
}

export function useUpdateBranding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateBranding) =>
      call(() => client.PUT('/api/v1/admin/branding', { body })),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin'] });
      void qc.invalidateQueries({ queryKey: ['firm-branding'] });
    },
  });
}

// ---------------------------------------------------------------- alerts & audit
export function useAdminAlerts(state: 'open' | 'all') {
  const ak = useAk();
  return useInfiniteQuery({
    queryKey: ak('alerts', state),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      call(() =>
        client.GET('/api/v1/admin/alerts', {
          params: { query: { cursor: pageParam, limit: 50, state } },
        }),
      ),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: useReady(),
    refetchInterval: 30_000,
  });
}

export const useAckAlert = () =>
  useAdminMutation((id: string) =>
    call(() => client.POST('/api/v1/admin/alerts/{id}/ack', { params: { path: { id } } })),
  );

export function useAdminAudit(action: string) {
  const ak = useAk();
  return useInfiniteQuery({
    queryKey: ak('audit', action),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      call(() =>
        client.GET('/api/v1/admin/audit', {
          params: { query: { cursor: pageParam, limit: 50, ...(action ? { action } : {}) } },
        }),
      ),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: useReady(),
    placeholderData: keepPreviousData,
  });
}

export const useVerifyAudit = () =>
  useMutation({ mutationFn: () => call(() => client.GET('/api/v1/admin/audit/verify')) });

// ---------------------------------------------------------------- team
export function useTeam() {
  const ak = useAk();
  return useQuery({
    queryKey: ak('team'),
    queryFn: () => call(() => client.GET('/api/v1/admin/team')),
    enabled: useReady(),
    select: (d) => d.items,
  });
}

export const useInvite = () =>
  useAdminMutation((body: { email: string; role: FirmRole }) =>
    call(() => client.POST('/api/v1/admin/team', { body })),
  );

export const useChangeRole = () =>
  useAdminMutation(({ id, role }: { id: string; role: FirmRole }) =>
    call(() =>
      client.PATCH('/api/v1/admin/team/{id}', { params: { path: { id } }, body: { role } }),
    ),
  );

export const useRemoveMember = () =>
  useAdminMutation((id: string) =>
    call(() => client.DELETE('/api/v1/admin/team/{id}', { params: { path: { id } } })),
  );

// ---------------------------------------------------------------- firms (superadmin)
export function useFirms(enabled: boolean) {
  const ready = useReady();
  return useQuery({
    // Not keyed by the selected firm: the list is the same for every selection.
    queryKey: ['admin-firms'],
    queryFn: () => call(() => client.GET('/api/v1/admin/firms')),
    enabled: ready && enabled,
    select: (d) => d.items,
  });
}

export function useCreateFirm() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Schemas['CreateFirmDto']) =>
      call(() => client.POST('/api/v1/admin/firms', { body })),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['admin-firms'] }),
  });
}

export function useFirmStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'ACTIVE' | 'SUSPENDED' }) =>
      call(() =>
        client.POST('/api/v1/admin/firms/{id}/status', {
          params: { path: { id } },
          body: { status },
        }),
      ),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['admin-firms'] }),
  });
}
