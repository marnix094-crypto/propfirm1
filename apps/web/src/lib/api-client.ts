import createClient from 'openapi-fetch';
import type { components, paths } from '@brand/shared/api';
import { ApiError } from './api';
import { useSession } from '@/stores/session';

export type Schemas = components['schemas'];
export type Account = Schemas['AccountDto'];
export type Position = Schemas['PositionDto'];
export type Order = Schemas['OrderDto'];
export type Fill = Schemas['FillDto'];
export type Instrument = Schemas['InstrumentDto'];
export type Ticker = Schemas['TickerDto'];
export type Candle = Schemas['CandleDto'];
export type EquityPoint = Schemas['EquityPointDto'];
export type PlaceOrder = Schemas['PlaceOrderDto'];

/** Typed client generated from the API's OpenAPI spec (packages/shared/openapi.json). */
export const client = createClient<paths>({
  baseUrl: import.meta.env.VITE_API_URL ?? '',
  credentials: 'include',
});

client.use({
  onRequest({ request }) {
    const token = useSession.getState().accessToken;
    if (token) request.headers.set('Authorization', `Bearer ${token}`);
    return request;
  },
});

interface Result<T> {
  data?: T;
  error?: unknown;
  response: Response;
}

/**
 * Runs a typed request; on 401 refreshes the session once and retries.
 * Throws ApiError with the stable problem+json `code` on failure.
 */
export async function call<T>(fn: () => Promise<Result<T>>): Promise<T> {
  let res: Result<T>;
  try {
    res = await fn();
    if (
      res.response.status === 401 &&
      useSession.getState().accessToken &&
      (await useSession.getState().refresh())
    ) {
      res = await fn();
    }
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(0, 'NETWORK_ERROR', 'Network error');
  }
  if (!res.response.ok) {
    const problem = (res.error ?? {}) as { code?: string; title?: string };
    throw new ApiError(
      res.response.status,
      problem.code ?? 'HTTP_ERROR',
      problem.title ?? res.response.statusText,
    );
  }
  return res.data as T;
}

/** Unique key for idempotent requests and client order ids. */
export const uid = () =>
  (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`).replace(
    /[^A-Za-z0-9_-]/g,
    '',
  );
