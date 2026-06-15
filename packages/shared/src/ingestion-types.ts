/**
 * Types for getting data into the system (Excel today, SAP later). The
 * validation problem shape is deliberately structured so the AI assistant can
 * later read it and propose a corrected file (Phase 10).
 */

/** A single, plain-language problem found while validating an upload. */
export interface ValidationProblem {
  /** Which sheet the problem is on (e.g. "Materials"). */
  sheet: string;
  /** 1-based row number in the sheet, if the problem is row-specific. */
  row?: number;
  /** Column header the problem relates to, if applicable. */
  column?: string;
  /** Stable machine-readable code, e.g. "missing_column", "not_a_number". */
  code: string;
  /** Human-readable explanation, safe to show directly to the user. */
  message: string;
}

/** Result of validating/ingesting an upload, surfaced to the UI. */
export interface IngestErrorResponse {
  ok: false;
  errors: ValidationProblem[];
}
