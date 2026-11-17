import { useMutation, useQuery } from '@tanstack/react-query';
import type {
  PayoutFeedResponse,
  PriceQuoteRequest,
  PriceQuoteResponse,
  ProductListResponse,
  ProductType,
} from '@brand/shared';
import { api } from '@/lib/api';

export function useProducts(type: ProductType) {
  return useQuery({
    queryKey: ['products', type],
    queryFn: ({ signal }) => api.get<ProductListResponse>(`/products?type=${type}`, signal),
    staleTime: 5 * 60_000,
  });
}

export function usePayoutFeed() {
  return useQuery({
    queryKey: ['public', 'payouts-feed'],
    queryFn: ({ signal }) => api.get<PayoutFeedResponse>('/public/payouts-feed', signal),
    staleTime: 60_000,
    retry: 1,
  });
}

export function usePriceQuote() {
  return useMutation({
    mutationFn: (body: PriceQuoteRequest) => api.post<PriceQuoteResponse>('/products/quote', body),
  });
}
