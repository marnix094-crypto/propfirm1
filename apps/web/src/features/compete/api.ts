import createClient from 'openapi-fetch';
import type { components, paths } from '@brand/shared/api';
import { ApiError } from '@/lib/api';
import { useCompeteSession } from './session';

/**
 * API client of the Compete product (D97). Separate instance from the platform client:
 * it only ever sends the player's compete token, never a platform token (D98).
 */
type S = components['schemas'];
export type CompeteOperator = S['CompeteOperatorDto'];
export type CompeteRound = S['CompeteRoundDto'];
export type CompeteEntry = S['CompeteEntryDto'];
export type CompeteOrder = S['CompeteOrderDto'];
export type CompeteLeaderboard = S['CompeteLeaderboardDto'];
export type CompeteLeaderboardRow = S['CompeteLeaderboardRowDto'];
export type CompeteHistoryItem = S['CompeteHistoryItemDto'];
export type CompetePlayer = S['CompetePlayerDto'];

/** Operator (tenant) override for previews: `?operator=slug` or VITE_COMPETE_OPERATOR. */
export function operatorSlug(): string | null {
  try {
    const q = new URLSearchParams(window.location.search).get('operator');
    if (q && /^[a-z0-9-]{1,40}$/.test(q)) sessionStorage.setItem('compete-operator', q);
    return (
      sessionStorage.getItem('compete-operator') ?? import.meta.env.VITE_COMPETE_OPERATOR ?? null
    );
  } catch {
    return import.meta.env.VITE_COMPETE_OPERATOR ?? null;
  }
}

export const competeClient = createClient<paths>({
  baseUrl: import.meta.env.VITE_API_URL ?? '',
  credentials: 'include',
  fetch: (request) => globalThis.fetch(request),
});

competeClient.use({
  onRequest({ request }) {
    const token = useCompeteSession.getState().accessToken;
    if (token) request.headers.set('Authorization', `Bearer ${token}`);
    const op = operatorSlug();
    if (op) request.headers.set('X-Compete-Operator', op);
    return request;
  },
});

interface Result<T> {
  data?: T;
  error?: unknown;
  response: Response;
}

/** Typed request; refreshes the compete session once on 401. Throws ApiError with the stable code. */
export async function competeCall<T>(fn: () => Promise<Result<T>>): Promise<T> {
  let res: Result<T>;
  try {
    res = await fn();
    if (
      res.response.status === 401 &&
      useCompeteSession.getState().accessToken &&
      (await useCompeteSession.getState().refresh())
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
