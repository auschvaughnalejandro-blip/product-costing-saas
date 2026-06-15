/**
 * The swappable SAP connector interface. The rest of the app talks to SAP only
 * through `fetchBom(...)`, so the underlying transport (OData, RFC/BAPI gateway,
 * CPI) can change later by writing one new implementation — nothing else changes.
 *
 * SAP is a SECOND data source alongside Excel: it produces the same
 * `SapBomResponse`, which the mapper converges onto the same `ValidatedData` the
 * Excel path produces. The engine never learns where the data came from.
 */
import type { SapBomResponse } from './mapper';
import { SapNotConfiguredError } from './errors';

export interface SapConnector {
  readonly name: string;
  /** True only when the connector is actually usable (connection details present). */
  readonly configured: boolean;
  /**
   * Fetch the BOM, routing and rates for one material/product from SAP.
   * Throws a `SapNotConfiguredError` if not configured, or a `SapUnavailableError`
   * if SAP cannot be reached — never a wrong or partial number.
   */
  fetchBom(materialNumber: string): Promise<SapBomResponse>;
}

/**
 * Connector used when SAP is not configured. It never invents data — it always
 * fails loudly with a clear message, so callers fall back to Excel.
 */
export class DisabledSapConnector implements SapConnector {
  readonly name = 'none';
  readonly configured = false;
  async fetchBom(_materialNumber: string): Promise<SapBomResponse> {
    throw new SapNotConfiguredError();
  }
}
