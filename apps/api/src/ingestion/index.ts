/**
 * Excel ingestion: parse → validate → map, kept as three distinct, testable
 * steps. A correctly-formatted file becomes engine-ready data; a malformed file
 * yields a clear, structured list of problems instead of a crash.
 */
import type { ValidationProblem } from '@costing/shared';
import { parseWorkbook } from './parse';
import { validateWorkbook } from './validate';
import { mapToProduct, type MappedUpload } from './map';

export type IngestResult = ({ ok: true } & MappedUpload) | { ok: false; errors: ValidationProblem[] };

export async function ingestExcel(buffer: Buffer): Promise<IngestResult> {
  const raw = await parseWorkbook(buffer);
  const validation = validateWorkbook(raw);
  if (!validation.ok) {
    return { ok: false, errors: validation.errors };
  }
  return { ok: true, ...mapToProduct(validation.data) };
}

export { parseWorkbook } from './parse';
export { validateWorkbook, type ValidatedData, type ValidationResult } from './validate';
export { mapToProduct, mappedToCostInput, type MappedUpload } from './map';
export { writeWorkbook, sampleWorkbookSpec, buildTemplateBuffer, type WorkbookSpec } from './template';
