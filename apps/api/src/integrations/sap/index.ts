/**
 * SAP integration entry point.
 *
 * SAP is a SECOND data source on top of Excel. The flow mirrors Excel ingestion
 * (fetch → validate → map) and ends in exactly the same `IngestResult`, so the
 * engine and everything downstream are identical regardless of where the data
 * came from. SAP is optional: when not configured the app continues on Excel.
 */
import type { ValidationProblem } from '@costing/shared';
import { config } from '../../config';
import { mapToProduct, type MappedUpload } from '../../ingestion';
import { DisabledSapConnector, type SapConnector } from './connector';
import { normalizeSapToValidatedData } from './mapper';
import { S4HanaConnector } from './s4hana';
import { validateSapResponse } from './validate';

let cached: SapConnector | null = null;

/** The configured SAP connector (S/4HANA if connection details are set, else a no-op). */
export function getSapConnector(): SapConnector {
  if (!cached) {
    cached = config.sap.configured
      ? new S4HanaConnector({
          baseUrl: config.sap.baseUrl,
          client: config.sap.client,
          username: config.sap.username,
          password: config.sap.password,
        })
      : new DisabledSapConnector();
  }
  return cached;
}

/** Reset the cached connector — used by tests to inject a fake. */
export function setSapConnector(connector: SapConnector | null): void {
  cached = connector;
}

export interface SapStatus {
  configured: boolean;
  connector: string;
}

export function sapStatus(connector: SapConnector = getSapConnector()): SapStatus {
  return { configured: connector.configured, connector: connector.name };
}

export type SapIngestResult =
  | ({ ok: true } & MappedUpload)
  | { ok: false; errors: ValidationProblem[] };

/**
 * Fetch a material from SAP and turn it into engine-ready data, or a structured
 * list of problems. Connection failures surface as thrown `SapError`s (handled
 * by the route); data problems come back as `{ ok: false, errors }` exactly like
 * a malformed Excel upload.
 */
export async function ingestFromSap(
  connector: SapConnector,
  materialNumber: string,
): Promise<SapIngestResult> {
  const raw = await connector.fetchBom(materialNumber);

  const problems = validateSapResponse(raw);
  if (problems.length > 0) {
    return { ok: false, errors: problems };
  }

  return { ok: true, ...mapToProduct(normalizeSapToValidatedData(raw), 'sap') };
}

export { type SapConnector, DisabledSapConnector } from './connector';
export { S4HanaConnector, type S4HanaConfig } from './s4hana';
export { normalizeSapToValidatedData, type SapBomResponse } from './mapper';
export { validateSapResponse } from './validate';
export { SapError, SapNotConfiguredError, SapUnavailableError, isSapError } from './errors';
