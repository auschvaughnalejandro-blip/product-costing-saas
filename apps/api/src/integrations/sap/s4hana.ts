/**
 * S/4HANA implementation of the SAP connector.
 *
 * It calls a gateway service on the client's S/4HANA system that returns the
 * BOM, routing and rates for a material as JSON in the `SapBomResponse` shape
 * (an OData service or CPI flow the client exposes). Authentication is HTTP
 * Basic with the configured user; the SAP client (mandant) is passed via the
 * `sap-client` query parameter as S/4HANA expects.
 *
 * Every failure path produces a clear `SapUnavailableError` rather than a raw
 * exception, so the API can degrade to Excel gracefully and never surface a
 * partial or wrong number.
 */
import { logger } from '../../lib/logger';
import type { SapConnector } from './connector';
import { SapUnavailableError } from './errors';
import type { SapBomResponse } from './mapper';

/** Default gateway service path. The client's system exposes the costed BOM here. */
export const DEFAULT_SAP_SERVICE_PATH = '/sap/opu/odata/sap/API_COSTING_BOM_SRV/CostedBom';

export interface S4HanaConfig {
  baseUrl: string;
  client: string;
  username: string;
  password: string;
  /** Override the gateway service path if the client exposes it elsewhere. */
  servicePath?: string;
  /** Abort the request after this many ms (default 15s). */
  timeoutMs?: number;
}

/** Injectable for testing; defaults to the global fetch. */
type FetchFn = typeof fetch;

export class S4HanaConnector implements SapConnector {
  readonly name = 's4hana';
  readonly configured = true;

  private readonly servicePath: string;
  private readonly timeoutMs: number;

  constructor(
    private readonly cfg: S4HanaConfig,
    private readonly fetchFn: FetchFn = fetch,
  ) {
    this.servicePath = cfg.servicePath ?? DEFAULT_SAP_SERVICE_PATH;
    this.timeoutMs = cfg.timeoutMs ?? 15_000;
  }

  private authHeader(): string {
    const token = Buffer.from(`${this.cfg.username}:${this.cfg.password}`).toString('base64');
    return `Basic ${token}`;
  }

  private buildUrl(materialNumber: string): string {
    const base = this.cfg.baseUrl.replace(/\/+$/, '');
    const url = new URL(`${base}${this.servicePath}`);
    url.searchParams.set('Material', materialNumber);
    if (this.cfg.client) url.searchParams.set('sap-client', this.cfg.client);
    url.searchParams.set('$format', 'json');
    return url.toString();
  }

  async fetchBom(materialNumber: string): Promise<SapBomResponse> {
    if (!materialNumber.trim()) {
      throw new SapUnavailableError('A material number is required to fetch data from SAP.');
    }

    const url = this.buildUrl(materialNumber);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let res: Response;
    try {
      res = await this.fetchFn(url, {
        method: 'GET',
        headers: {
          Authorization: this.authHeader(),
          Accept: 'application/json',
        },
        signal: controller.signal,
      });
    } catch (err) {
      const reason =
        err instanceof Error && err.name === 'AbortError' ? 'timed out' : 'is unreachable';
      logger.warn('SAP request failed', { material: materialNumber, reason });
      throw new SapUnavailableError(
        `SAP at ${this.cfg.baseUrl} ${reason}. The app continues to work with Excel.`,
      );
    } finally {
      clearTimeout(timer);
    }

    if (res.status === 401 || res.status === 403) {
      throw new SapUnavailableError(
        'SAP rejected the configured credentials (check SAP_USERNAME / SAP_PASSWORD).',
      );
    }
    if (res.status === 404) {
      throw new SapUnavailableError(`SAP has no costing BOM for material "${materialNumber}".`);
    }
    if (!res.ok) {
      throw new SapUnavailableError(
        `SAP returned an error (HTTP ${res.status}) for material "${materialNumber}".`,
      );
    }

    let payload: unknown;
    try {
      payload = await res.json();
    } catch {
      throw new SapUnavailableError('SAP returned a response that was not valid JSON.');
    }

    // OData commonly wraps the entity in { d: {...} } or { value: [...] }; unwrap
    // it here so the rest of the pipeline always sees a plain SapBomResponse.
    return unwrap(payload) as SapBomResponse;
  }
}

function unwrap(payload: unknown): unknown {
  if (payload && typeof payload === 'object') {
    const obj = payload as Record<string, unknown>;
    if (obj.d !== undefined) return unwrap(obj.d);
    if (Array.isArray(obj.results)) return obj.results[0];
    if (Array.isArray(obj.value)) return obj.value[0];
  }
  return payload;
}
