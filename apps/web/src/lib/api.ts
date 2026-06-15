/**
 * Thin API client. One place that knows how to talk to the backend:
 * base URL, credentials (auth cookie), JSON encoding, and error shape.
 */
import type { ApiError, HealthResponse } from '@costing/shared';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

/** Error thrown for any non-2xx API response, carrying the server's message. */
export class ApiClientError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  // Only set JSON content-type when we're sending a plain body (not FormData).
  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(`${API_URL}${path}`, {
    credentials: 'include',
    ...options,
    headers,
  });

  const contentType = res.headers.get('content-type') ?? '';
  const body = contentType.includes('application/json') ? await res.json() : null;

  if (!res.ok) {
    const err = (body ?? {}) as Partial<ApiError>;
    throw new ApiClientError(
      res.status,
      err.error ?? 'error',
      err.message ?? res.statusText,
      err.details,
    );
  }

  return body as T;
}

export const getHealth = () => apiFetch<HealthResponse>('/api/health');
