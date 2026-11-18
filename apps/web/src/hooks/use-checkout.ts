import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { call, client, uid, type Schemas } from '@/lib/api-client';
import { qk } from './use-trading';

export type Purchase = Schemas['PurchaseDto'];
export type CheckoutRequest = Schemas['CheckoutRequestDto'];
export type FundingProgress = Schemas['FundingProgressDto'];

/** Starts a checkout. The idempotency key is fixed per attempt so retries never double-charge. */
export function useCreateCheckout() {
  return useMutation({
    mutationFn: ({ body, key }: { body: CheckoutRequest; key: string }) =>
      call(() =>
        client.POST('/api/v1/checkout', { body, params: { header: { 'Idempotency-Key': key } } }),
      ),
  });
}

export const newCheckoutKey = () => `checkout-${uid()}`;

/** Purchase status; polls while the payment is still open. */
export function usePurchase(id: string | undefined) {
  return useQuery({
    queryKey: ['purchase', id],
    queryFn: () =>
      call(() => client.GET('/api/v1/checkout/{id}', { params: { path: { id: id! } } })),
    enabled: !!id,
    refetchInterval: (q) => (q.state.data?.status === 'PENDING' ? 3000 : false),
  });
}

export function useTestPayment(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (outcome: Schemas['TestPaymentDto']['outcome']) =>
      call(() =>
        client.POST('/api/v1/checkout/{id}/test-payment', {
          params: { path: { id } },
          body: { outcome },
        }),
      ),
    onSuccess: (p) => {
      qc.setQueryData(['purchase', id], p);
      void qc.invalidateQueries({ queryKey: qk.accounts });
    },
  });
}

export function useFunding(accountId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: qk.funding(accountId ?? 'none'),
    queryFn: () =>
      call(() =>
        client.GET('/api/v1/accounts/{id}/funding', { params: { path: { id: accountId! } } }),
      ),
    enabled: !!accountId && enabled,
    refetchInterval: 15_000,
  });
}
