import { useMutation, useQuery } from '@tanstack/react-query';
import { call, client, type Schemas } from '@/lib/api-client';

export type Product = Schemas['ProductDto'];
export type ProductRules = Schemas['ProductRulesDto'];
export type PriceQuote = Schemas['PriceQuoteDto'];
export type PriceQuoteRequest = Schemas['PriceQuoteRequestDto'];

export function useProducts(type: Product['type']) {
  return useQuery({
    queryKey: ['products', type],
    queryFn: () => call(() => client.GET('/api/v1/products', { params: { query: { type } } })),
    staleTime: 5 * 60_000,
  });
}

export function useProduct(id: string | null) {
  return useQuery({
    queryKey: ['product', id],
    queryFn: () =>
      call(() => client.GET('/api/v1/products/{id}', { params: { path: { id: id! } } })),
    enabled: !!id,
    staleTime: 5 * 60_000,
  });
}

export function usePayoutFeed() {
  return useQuery({
    queryKey: ['public', 'payouts-feed'],
    queryFn: () => call(() => client.GET('/api/v1/public/payouts-feed')),
    staleTime: 60_000,
    retry: 1,
  });
}

export function usePriceQuote() {
  return useMutation({
    mutationFn: (body: PriceQuoteRequest) =>
      call(() => client.POST('/api/v1/products/quote', { body })),
  });
}

export function useQuote(id: string | null) {
  return useQuery({
    queryKey: ['quote', id],
    queryFn: () =>
      call(() => client.GET('/api/v1/products/quotes/{id}', { params: { path: { id: id! } } })),
    enabled: !!id,
  });
}
