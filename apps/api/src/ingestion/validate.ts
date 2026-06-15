/**
 * Step 2 of 3 — VALIDATE. Check the parsed data is complete and sane, collecting
 * EVERY problem (not just the first) in plain language. The structured output is
 * what the AI assistant later uses to propose a corrected file.
 */
import type { OverheadRule, ValidationProblem } from '@costing/shared';
import {
  OVERHEAD_BASES,
  OVERHEAD_TYPES,
  REQUIRED_COLUMNS,
  REQUIRED_SHEETS,
  SETTINGS_KEYS,
  SHEETS,
} from './format';
import type { RawSheet, RawWorkbook } from './parse';

export interface ValidatedMaterial {
  code: string;
  name: string;
  unit?: string;
  unitPrice: number;
  currency?: string;
}
export interface ValidatedPart {
  nodeId: string;
  parentId?: string;
  name: string;
  quantity: number;
  unit?: string;
  materialCode?: string;
}
export interface ValidatedOperation {
  opId: string;
  partId: string;
  name: string;
  machineTime: number;
  labourTime: number;
  machineRateCode?: string;
  labourRateCode?: string;
}
export interface ValidatedNamedRate {
  kind: 'labour' | 'machine';
  code: string;
  rate: number;
}
export interface ValidatedData {
  product: { code: string; name: string; description?: string; currency: string };
  materials: ValidatedMaterial[];
  parts: ValidatedPart[];
  operations: ValidatedOperation[];
  namedRates: ValidatedNamedRate[];
  rates: {
    labourRate: number;
    machineRate: number;
    overhead: OverheadRule;
    currency: string;
  };
}

export type ValidationResult =
  | { ok: true; data: ValidatedData }
  | { ok: false; errors: ValidationProblem[] };

class Problems {
  readonly list: ValidationProblem[] = [];
  add(p: ValidationProblem): void {
    this.list.push(p);
  }
}

function str(value: unknown): string {
  return value === undefined || value === null ? '' : String(value).trim();
}

/** Parse a number; records a problem and returns undefined when invalid. */
function parseNumber(
  problems: Problems,
  value: unknown,
  sheet: string,
  row: number,
  column: string,
  { min }: { min?: number } = {},
): number | undefined {
  const s = str(value);
  if (s === '') {
    problems.add({ sheet, row, column, code: 'required', message: `${column} is required on row ${row}.` });
    return undefined;
  }
  const n = Number(s);
  if (!Number.isFinite(n)) {
    problems.add({
      sheet,
      row,
      column,
      code: 'not_a_number',
      message: `${column} on row ${row} must be a number, but is "${s}".`,
    });
    return undefined;
  }
  if (min !== undefined && n < min) {
    problems.add({
      sheet,
      row,
      column,
      code: 'out_of_range',
      message: `${column} on row ${row} must be ${min} or more, but is ${n}.`,
    });
    return undefined;
  }
  return n;
}

function requireString(
  problems: Problems,
  value: unknown,
  sheet: string,
  row: number,
  column: string,
): string | undefined {
  const s = str(value);
  if (s === '') {
    problems.add({ sheet, row, column, code: 'required', message: `${column} is required on row ${row}.` });
    return undefined;
  }
  return s;
}

function checkColumns(problems: Problems, sheet: RawSheet, required: readonly string[]): void {
  const present = new Set(sheet.headers.map((h) => h.toLowerCase()));
  for (const col of required) {
    if (!present.has(col.toLowerCase())) {
      problems.add({
        sheet: sheet.name,
        column: col,
        code: 'missing_column',
        message: `The "${sheet.name}" sheet is missing the required "${col}" column.`,
      });
    }
  }
}

export function validateWorkbook(raw: RawWorkbook): ValidationResult {
  const problems = new Problems();

  // 1. Required sheets present.
  const sheetByName: Record<string, { present: boolean }> = {
    [SHEETS.materials]: raw.materials,
    [SHEETS.parts]: raw.parts,
    [SHEETS.settings]: { present: raw.settings.present },
  };
  for (const name of REQUIRED_SHEETS) {
    if (!sheetByName[name]?.present) {
      problems.add({
        sheet: name,
        code: 'missing_sheet',
        message: `The workbook is missing the required "${name}" sheet.`,
      });
    }
  }

  // 2. Required columns on present sheets.
  if (raw.materials.present) checkColumns(problems, raw.materials, REQUIRED_COLUMNS.materials);
  if (raw.parts.present) checkColumns(problems, raw.parts, REQUIRED_COLUMNS.parts);
  if (raw.operations.present) checkColumns(problems, raw.operations, REQUIRED_COLUMNS.operations);
  if (raw.namedRates.present) checkColumns(problems, raw.namedRates, REQUIRED_COLUMNS.namedRates);

  // 3. Materials.
  const materials: ValidatedMaterial[] = [];
  const materialCodes = new Set<string>();
  for (const { rowNumber, values } of raw.materials.rows) {
    const code = requireString(problems, values.Code, SHEETS.materials, rowNumber, 'Code');
    const name = requireString(problems, values.Name, SHEETS.materials, rowNumber, 'Name');
    const unitPrice = parseNumber(problems, values.UnitPrice, SHEETS.materials, rowNumber, 'UnitPrice', {
      min: 0,
    });
    if (code && materialCodes.has(code)) {
      problems.add({
        sheet: SHEETS.materials,
        row: rowNumber,
        column: 'Code',
        code: 'duplicate_value',
        message: `Material code "${code}" appears more than once.`,
      });
    }
    if (code) materialCodes.add(code);
    if (code && name && unitPrice !== undefined) {
      materials.push({
        code,
        name,
        unit: str(values.Unit) || undefined,
        unitPrice,
        currency: str(values.Currency) || undefined,
      });
    }
  }

  // 4. Settings → product header + rates.
  const s = raw.settings.values;
  const settingsRow = (key: string) => raw.settings.rowOf[key] ?? 1;
  const productCode = requireString(problems, s[SETTINGS_KEYS.productCode], SHEETS.settings, settingsRow(SETTINGS_KEYS.productCode), 'ProductCode');
  const productName = requireString(problems, s[SETTINGS_KEYS.productName], SHEETS.settings, settingsRow(SETTINGS_KEYS.productName), 'ProductName');
  const labourRate = parseNumber(problems, s[SETTINGS_KEYS.labourRate], SHEETS.settings, settingsRow(SETTINGS_KEYS.labourRate), 'LabourRate', { min: 0 });
  const machineRate = parseNumber(problems, s[SETTINGS_KEYS.machineRate], SHEETS.settings, settingsRow(SETTINGS_KEYS.machineRate), 'MachineRate', { min: 0 });
  const currency = str(s[SETTINGS_KEYS.currency]) || 'USD';

  let overhead: OverheadRule = { type: 'none' };
  const overheadType = str(s[SETTINGS_KEYS.overheadType]).toLowerCase();
  if (!raw.settings.present || overheadType === '') {
    problems.add({
      sheet: SHEETS.settings,
      column: 'OverheadType',
      code: 'required',
      message: 'OverheadType is required (one of: none, percentage, fixed).',
    });
  } else if (!OVERHEAD_TYPES.includes(overheadType as (typeof OVERHEAD_TYPES)[number])) {
    problems.add({
      sheet: SHEETS.settings,
      column: 'OverheadType',
      code: 'invalid_value',
      message: `OverheadType must be one of ${OVERHEAD_TYPES.join(', ')} (got "${overheadType}").`,
    });
  } else if (overheadType === 'percentage') {
    const percent = parseNumber(problems, s[SETTINGS_KEYS.overheadPercent], SHEETS.settings, settingsRow(SETTINGS_KEYS.overheadPercent), 'OverheadPercent', { min: 0 });
    const baseRaw = str(s[SETTINGS_KEYS.overheadBase]).toLowerCase();
    let base: (typeof OVERHEAD_BASES)[number] = 'conversion';
    if (baseRaw !== '') {
      if (OVERHEAD_BASES.includes(baseRaw as (typeof OVERHEAD_BASES)[number])) {
        base = baseRaw as (typeof OVERHEAD_BASES)[number];
      } else {
        problems.add({
          sheet: SHEETS.settings,
          column: 'OverheadBase',
          code: 'invalid_value',
          message: `OverheadBase must be one of ${OVERHEAD_BASES.join(', ')} (got "${baseRaw}").`,
        });
      }
    }
    if (percent !== undefined) overhead = { type: 'percentage', percent, base };
  } else if (overheadType === 'fixed') {
    const amount = parseNumber(problems, s[SETTINGS_KEYS.overheadAmount], SHEETS.settings, settingsRow(SETTINGS_KEYS.overheadAmount), 'OverheadAmount', { min: 0 });
    if (amount !== undefined) overhead = { type: 'fixed', amount };
  }

  // 5. Parts → tree.
  const parts: ValidatedPart[] = [];
  const nodeIds = new Set<string>();
  // Structure (root/parent/cycle) is checked from the raw ids, independently of
  // per-field validity, so a part with a bad quantity doesn't hide a bad parent.
  const structural: { nodeId: string; parentId?: string }[] = [];
  for (const { rowNumber, values } of raw.parts.rows) {
    const nodeId = requireString(problems, values.NodeId, SHEETS.parts, rowNumber, 'NodeId');
    const name = requireString(problems, values.Name, SHEETS.parts, rowNumber, 'Name');
    const quantity = parseNumber(problems, values.Quantity, SHEETS.parts, rowNumber, 'Quantity', { min: 0 });
    const parentId = str(values.ParentId) || undefined;
    const materialCode = str(values.MaterialCode) || undefined;

    if (nodeId && nodeIds.has(nodeId)) {
      problems.add({
        sheet: SHEETS.parts,
        row: rowNumber,
        column: 'NodeId',
        code: 'duplicate_value',
        message: `Part id "${nodeId}" appears more than once.`,
      });
    }
    if (nodeId) {
      nodeIds.add(nodeId);
      structural.push({ nodeId, parentId });
    }
    if (materialCode && !materialCodes.has(materialCode)) {
      problems.add({
        sheet: SHEETS.parts,
        row: rowNumber,
        column: 'MaterialCode',
        code: 'broken_reference',
        message: `Part "${nodeId ?? name}" references material "${materialCode}", which isn't in the Materials sheet.`,
      });
    }
    if (nodeId && name && quantity !== undefined) {
      parts.push({
        nodeId,
        parentId,
        name,
        quantity,
        unit: str(values.Unit) || undefined,
        materialCode,
      });
    }
  }

  // Parent references, single root, and cycles.
  if (raw.parts.present) {
    const roots = structural.filter((p) => !p.parentId);
    if (structural.length > 0 && roots.length === 0) {
      problems.add({
        sheet: SHEETS.parts,
        code: 'no_root',
        message: 'No product root found: exactly one part must have a blank ParentId.',
      });
    } else if (roots.length > 1) {
      problems.add({
        sheet: SHEETS.parts,
        code: 'multiple_roots',
        message: `Found ${roots.length} parts with a blank ParentId; there must be exactly one (the product).`,
      });
    }
    for (const p of structural) {
      if (p.parentId && !nodeIds.has(p.parentId)) {
        problems.add({
          sheet: SHEETS.parts,
          column: 'ParentId',
          code: 'broken_reference',
          message: `Part "${p.nodeId}" has parent "${p.parentId}", which doesn't exist.`,
        });
      }
    }
    detectCycles(problems, structural);
  }

  // 6. Operations.
  const operations: ValidatedOperation[] = [];
  const opIds = new Set<string>();
  const namedRateCodes = { labour: new Set<string>(), machine: new Set<string>() };
  // 7. Named rates (validated first so operations can reference them).
  const namedRates: ValidatedNamedRate[] = [];
  for (const { rowNumber, values } of raw.namedRates.rows) {
    const kindRaw = str(values.Kind).toLowerCase();
    const code = requireString(problems, values.Code, SHEETS.namedRates, rowNumber, 'Code');
    const rate = parseNumber(problems, values.Rate, SHEETS.namedRates, rowNumber, 'Rate', { min: 0 });
    if (kindRaw !== 'labour' && kindRaw !== 'machine') {
      problems.add({
        sheet: SHEETS.namedRates,
        row: rowNumber,
        column: 'Kind',
        code: 'invalid_value',
        message: `Kind on row ${rowNumber} must be "labour" or "machine" (got "${kindRaw}").`,
      });
    } else if (code && rate !== undefined) {
      namedRates.push({ kind: kindRaw, code, rate });
      namedRateCodes[kindRaw].add(code);
    }
  }

  for (const { rowNumber, values } of raw.operations.rows) {
    const opId = requireString(problems, values.OpId, SHEETS.operations, rowNumber, 'OpId');
    const partId = requireString(problems, values.PartId, SHEETS.operations, rowNumber, 'PartId');
    const name = requireString(problems, values.Name, SHEETS.operations, rowNumber, 'Name');
    const machineTime = parseNumber(problems, values.MachineTime, SHEETS.operations, rowNumber, 'MachineTime', { min: 0 });
    const labourTime = parseNumber(problems, values.LabourTime, SHEETS.operations, rowNumber, 'LabourTime', { min: 0 });
    const machineRateCode = str(values.MachineRateCode) || undefined;
    const labourRateCode = str(values.LabourRateCode) || undefined;

    if (opId && opIds.has(opId)) {
      problems.add({
        sheet: SHEETS.operations,
        row: rowNumber,
        column: 'OpId',
        code: 'duplicate_value',
        message: `Operation id "${opId}" appears more than once.`,
      });
    }
    if (opId) opIds.add(opId);
    if (partId && !nodeIds.has(partId)) {
      problems.add({
        sheet: SHEETS.operations,
        row: rowNumber,
        column: 'PartId',
        code: 'broken_reference',
        message: `Operation "${opId ?? name}" is on part "${partId}", which isn't in the Parts sheet.`,
      });
    }
    if (machineRateCode && !namedRateCodes.machine.has(machineRateCode)) {
      problems.add({
        sheet: SHEETS.operations,
        row: rowNumber,
        column: 'MachineRateCode',
        code: 'broken_reference',
        message: `Operation "${opId ?? name}" references machine rate "${machineRateCode}", which isn't in NamedRates.`,
      });
    }
    if (labourRateCode && !namedRateCodes.labour.has(labourRateCode)) {
      problems.add({
        sheet: SHEETS.operations,
        row: rowNumber,
        column: 'LabourRateCode',
        code: 'broken_reference',
        message: `Operation "${opId ?? name}" references labour rate "${labourRateCode}", which isn't in NamedRates.`,
      });
    }
    if (opId && partId && name && machineTime !== undefined && labourTime !== undefined) {
      operations.push({ opId, partId, name, machineTime, labourTime, machineRateCode, labourRateCode });
    }
  }

  if (problems.list.length > 0) {
    return { ok: false, errors: problems.list };
  }

  return {
    ok: true,
    data: {
      product: {
        code: productCode!,
        name: productName!,
        description: str(s[SETTINGS_KEYS.productDescription]) || undefined,
        currency,
      },
      materials,
      parts,
      operations,
      namedRates,
      rates: { labourRate: labourRate!, machineRate: machineRate!, overhead, currency },
    },
  };
}

/** Detect a part that is (transitively) its own ancestor. */
function detectCycles(problems: Problems, parts: { nodeId: string; parentId?: string }[]): void {
  const parentOf = new Map<string, string | undefined>();
  for (const p of parts) parentOf.set(p.nodeId, p.parentId);
  for (const p of parts) {
    const seen = new Set<string>();
    let current: string | undefined = p.nodeId;
    while (current) {
      if (seen.has(current)) {
        problems.add({
          sheet: SHEETS.parts,
          column: 'ParentId',
          code: 'circular_reference',
          message: `Part "${p.nodeId}" is part of a circular reference (a part that contains itself).`,
        });
        break;
      }
      seen.add(current);
      current = parentOf.get(current);
    }
  }
}
