/** Common primitives shared across the platform. */

/**
 * A numeric value that may arrive as a JS number or a decimal string.
 *
 * Money and rates flow through the system as strings wherever possible so we
 * never lose precision to floating point (PostgreSQL `NUMERIC` columns are
 * returned by the driver as strings, for example). The costing engine accepts
 * either form and does all arithmetic with a decimal library.
 */
export type Numeric = number | string;

/** A decimal-safe money value, represented as a fixed-precision string (e.g. "12.34"). */
export type Money = string;

/** Health-check payload returned by `GET /api/health`. */
export interface HealthResponse {
  status: 'ok';
  service: string;
  time: string;
  version: string;
}

/** Standard shape for an error returned by the API. */
export interface ApiError {
  error: string;
  message: string;
  /** Optional structured details, e.g. a list of validation problems. */
  details?: unknown;
}
