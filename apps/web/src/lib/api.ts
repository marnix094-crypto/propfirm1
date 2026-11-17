import type { ProblemDetails } from '@brand/shared';

/** Base URL of the API. Relative by default: the dev server and nginx proxy `/api`. */
const BASE = `${import.meta.env.VITE_API_URL ?? ''}/api/v1`;

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...init?.headers },
      credentials: 'include',
    });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'Network error');
  }
  if (!res.ok) {
    let problem: Partial<ProblemDetails> = {};
    try {
      problem = (await res.json()) as ProblemDetails;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, problem.code ?? 'HTTP_ERROR', problem.title ?? res.statusText);
  }
  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string, signal?: AbortSignal) => request<T>(path, { signal }),
  post: <T>(path: string, body: unknown, signal?: AbortSignal) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body), signal }),
};

/** True when MSW mock data is active (opt-in for development and test builds only). */
export const isMockData = (): boolean => import.meta.env.VITE_ENABLE_MSW === 'true';
