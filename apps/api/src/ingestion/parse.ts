/**
 * Step 1 of 3 — PARSE. Read the raw cell values out of a workbook with no
 * judgement about whether they're valid. Keeping parsing separate from
 * validation makes both easy to test and to reason about.
 */
import ExcelJS from 'exceljs';
import { COLUMNS, SETTINGS_KEYS, SHEETS } from './format';

export interface RawRow {
  /** 1-based row number in the sheet (so error messages can point at it). */
  rowNumber: number;
  /** Cell values keyed by canonical column name (case-insensitively matched). */
  values: Record<string, unknown>;
}

export interface RawSheet {
  name: string;
  present: boolean;
  headers: string[];
  rows: RawRow[];
}

export interface RawSettings {
  present: boolean;
  values: Record<string, string>;
  rowOf: Record<string, number>;
}

export interface RawWorkbook {
  materials: RawSheet;
  parts: RawSheet;
  operations: RawSheet;
  namedRates: RawSheet;
  settings: RawSettings;
}

/** Normalise an ExcelJS cell value into a plain primitive (or undefined). */
function cellValue(value: unknown): unknown {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if ('text' in obj && obj.text != null) return obj.text;
    if ('result' in obj) return obj.result;
    if ('richText' in obj && Array.isArray(obj.richText)) {
      return (obj.richText as { text: string }[]).map((r) => r.text).join('');
    }
    if ('error' in obj) return undefined;
    if (value instanceof Date) return value;
  }
  return value;
}

function isBlank(value: unknown): boolean {
  return value === undefined || String(value).trim() === '';
}

/**
 * Read a single cell as a plain primitive, handling MERGED CELLS explicitly.
 *
 * Excel stores a merged region's value only in its top-left (master) cell and
 * leaves the other cells blank. So when a cell is blank but part of a merge, we
 * resolve it to the master's value — that way a value sitting under a merged
 * header or spanning a region is read consistently instead of coming back
 * undefined for every cell but the first.
 */
function resolveCell(cell: ExcelJS.Cell): unknown {
  const value = cellValue(cell.value);
  if (isBlank(value) && cell.isMerged && cell.master && cell.master !== cell) {
    return cellValue(cell.master.value);
  }
  return value;
}

function findSheet(wb: ExcelJS.Workbook, name: string): ExcelJS.Worksheet | undefined {
  return wb.worksheets.find((ws) => ws.name.trim().toLowerCase() === name.toLowerCase());
}

function readSheet(wb: ExcelJS.Workbook, name: string, known: readonly string[]): RawSheet {
  const ws = findSheet(wb, name);
  if (!ws) return { name, present: false, headers: [], rows: [] };

  const headerRow = ws.getRow(1);
  const colMap: { index: number; key: string }[] = [];
  const headers: string[] = [];
  for (let c = 1; c <= ws.columnCount; c += 1) {
    const raw = resolveCell(headerRow.getCell(c));
    if (isBlank(raw)) continue;
    const text = String(raw).trim();
    const canonical = known.find((k) => k.toLowerCase() === text.toLowerCase()) ?? text;
    colMap.push({ index: c, key: canonical });
    headers.push(canonical);
  }

  const rows: RawRow[] = [];
  for (let r = 2; r <= ws.rowCount; r += 1) {
    const row = ws.getRow(r);
    const values: Record<string, unknown> = {};
    let hasAny = false;
    for (const { index, key } of colMap) {
      const v = resolveCell(row.getCell(index));
      if (!isBlank(v)) {
        values[key] = v;
        hasAny = true;
      } else {
        values[key] = undefined;
      }
    }
    // Strip completely empty rows up front: real spreadsheets carry trailing /
    // interspersed blank rows that would otherwise trip validation downstream.
    if (hasAny) rows.push({ rowNumber: r, values });
  }

  return { name, present: true, headers, rows };
}

function readSettings(wb: ExcelJS.Workbook, name: string): RawSettings {
  const ws = findSheet(wb, name);
  if (!ws) return { present: false, values: {}, rowOf: {} };

  const knownKeys = Object.values(SETTINGS_KEYS);
  const values: Record<string, string> = {};
  const rowOf: Record<string, number> = {};
  for (let r = 1; r <= ws.rowCount; r += 1) {
    const row = ws.getRow(r);
    const k = resolveCell(row.getCell(1));
    if (isBlank(k)) continue;
    const keyText = String(k).trim();
    if (keyText.toLowerCase() === 'key') continue; // header row
    const canonical = knownKeys.find((sk) => sk.toLowerCase() === keyText.toLowerCase()) ?? keyText;
    const v = resolveCell(row.getCell(2));
    values[canonical] = isBlank(v) ? '' : String(v).trim();
    rowOf[canonical] = r;
  }
  return { present: true, values, rowOf };
}

export async function parseWorkbook(buffer: Buffer): Promise<RawWorkbook> {
  const wb = new ExcelJS.Workbook();
  // Cast bridges the @types/node generic Buffer and ExcelJS's expected type.
  await wb.xlsx.load(buffer as unknown as Parameters<typeof wb.xlsx.load>[0]);
  return {
    materials: readSheet(wb, SHEETS.materials, COLUMNS.materials),
    parts: readSheet(wb, SHEETS.parts, COLUMNS.parts),
    operations: readSheet(wb, SHEETS.operations, COLUMNS.operations),
    namedRates: readSheet(wb, SHEETS.namedRates, COLUMNS.namedRates),
    settings: readSettings(wb, SHEETS.settings),
  };
}
