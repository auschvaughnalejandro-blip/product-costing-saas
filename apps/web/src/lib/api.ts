/**
 * Thin API client. One place that knows how to talk to the backend:
 * base URL, credentials (auth cookie), JSON encoding, and error shape.
 *
 * The UI never calculates cost — it asks the API (which asks the engine) and
 * displays the result. `recalculate` is how every what-if is costed.
 */
import type {
  CostInput,
  CostResult,
  HealthResponse,
  ValidationProblem,
} from '@costing/shared';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

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
  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const res = await fetch(`${API_URL}${path}`, { credentials: 'include', ...options, headers });
  const contentType = res.headers.get('content-type') ?? '';
  const body = contentType.includes('application/json') ? await res.json() : null;
  if (!res.ok) {
    const err = (body ?? {}) as { error?: string; message?: string; details?: unknown };
    throw new ApiClientError(res.status, err.error ?? 'error', err.message ?? res.statusText, err.details);
  }
  return body as T;
}

// ── domain types (mirror the API responses) ──────────────────────────────────

export type UserRole = 'admin' | 'estimator' | 'approver' | 'viewer';
export interface User {
  id: string;
  tenantId: string;
  email: string;
  name: string;
  role: UserRole;
}

export interface ProductSummary {
  id: string;
  code: string;
  name: string;
  description: string | null;
  currency: string;
  updatedAt: string;
}

export type CostVersionKind = 'draft' | 'final';
export type CostVersionStatus = 'draft' | 'submitted' | 'approved' | 'rejected';

export interface VersionSummary {
  id: string;
  productId: string;
  versionNo: number;
  name: string;
  kind: CostVersionKind;
  status: CostVersionStatus;
  currency: string;
  totalCost: string;
  notes: string | null;
  createdBy: string | null;
  createdAt: string;
}
export interface VersionRecord extends VersionSummary {
  input: CostInput;
  result: CostResult;
}

export interface Material {
  id: string;
  code: string;
  name: string;
  unit: string | null;
  unitPrice: string;
  currency: string;
  source: string;
  description: string | null;
}

export interface CostResponse {
  input: CostInput;
  result: CostResult;
}

export type UploadResult =
  | { ok: true; productId: string; result: CostResult }
  | { ok: false; errors: ValidationProblem[] };

// ── endpoints ─────────────────────────────────────────────────────────────────

export const getHealth = () => apiFetch<HealthResponse>('/api/health');

export async function me(): Promise<User | null> {
  try {
    const r = await apiFetch<{ user: User }>('/api/auth/me');
    return r.user;
  } catch (err) {
    if (err instanceof ApiClientError && err.status === 401) return null;
    throw err;
  }
}

export async function login(email: string, password: string): Promise<User> {
  const r = await apiFetch<{ user: User }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  return r.user;
}

export async function register(email: string, name: string, password: string): Promise<User> {
  const r = await apiFetch<{ user: User }>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, name, password }),
  });
  return r.user;
}

export const logout = () => apiFetch<{ ok: true }>('/api/auth/logout', { method: 'POST' });

export const listProducts = () =>
  apiFetch<{ products: ProductSummary[] }>('/api/products').then((r) => r.products);

export const getProductCost = (id: string) =>
  apiFetch<CostResponse>(`/api/products/${id}/cost`);

export const getProductDefinition = (id: string) =>
  apiFetch<{ product: unknown }>(`/api/products/${id}`).then((r) => r.product);

export const recalculate = (input: CostInput) =>
  apiFetch<{ result: CostResult }>('/api/products/recalculate', {
    method: 'POST',
    body: JSON.stringify({ input }),
  }).then((r) => r.result);

export const listVersions = (productId: string) =>
  apiFetch<{ versions: VersionSummary[] }>(`/api/products/${productId}/versions`).then(
    (r) => r.versions,
  );

export const createVersion = (
  productId: string,
  body: { name: string; kind: CostVersionKind; input?: CostInput; notes?: string },
) =>
  apiFetch<{ version: VersionSummary }>(`/api/products/${productId}/versions`, {
    method: 'POST',
    body: JSON.stringify(body),
  }).then((r) => r.version);

export const getVersion = (id: string) =>
  apiFetch<{ version: VersionRecord }>(`/api/versions/${id}`).then((r) => r.version);

export const listMaterials = () =>
  apiFetch<{ materials: Material[] }>('/api/materials').then((r) => r.materials);

export const templateUrl = `${API_URL}/api/uploads/template`;

export async function uploadExcel(file: File, opts?: { dryRun?: boolean }): Promise<UploadResult> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${API_URL}/api/uploads/excel${opts?.dryRun ? '?dryRun=1' : ''}`, {
    method: 'POST',
    credentials: 'include',
    body: form,
  });
  const body = await res.json().catch(() => null);
  if (res.status === 422) return body as UploadResult;
  if (!res.ok) {
    const err = (body ?? {}) as { error?: string; message?: string; details?: unknown };
    throw new ApiClientError(res.status, err.error ?? 'error', err.message ?? res.statusText, err.details);
  }
  return body as UploadResult;
}
