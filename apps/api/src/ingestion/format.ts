/**
 * THE expected Excel format — the single contract for uploads. Documented in
 * docs/EXCEL_FORMAT.md and used by the parser, validator, and template builder.
 */

export const SHEETS = {
  materials: 'Materials',
  parts: 'Parts',
  operations: 'Operations',
  settings: 'Settings',
  namedRates: 'NamedRates',
} as const;

export const COLUMNS = {
  materials: ['Code', 'Name', 'Unit', 'UnitPrice', 'Currency'],
  parts: ['NodeId', 'ParentId', 'Name', 'Quantity', 'Unit', 'MaterialCode'],
  operations: ['OpId', 'PartId', 'Name', 'MachineTime', 'LabourTime', 'MachineRateCode', 'LabourRateCode'],
  namedRates: ['Kind', 'Code', 'Rate'],
} as const;

/** Columns that must be present (and non-blank per row) for each sheet. */
export const REQUIRED_COLUMNS = {
  materials: ['Code', 'Name', 'UnitPrice'],
  parts: ['NodeId', 'Name', 'Quantity'],
  operations: ['OpId', 'PartId', 'Name', 'MachineTime', 'LabourTime'],
  namedRates: ['Kind', 'Code', 'Rate'],
} as const;

/** Sheets that must exist in any valid upload. */
export const REQUIRED_SHEETS = [SHEETS.materials, SHEETS.parts, SHEETS.settings] as const;

export const SETTINGS_KEYS = {
  labourRate: 'LabourRate',
  machineRate: 'MachineRate',
  overheadType: 'OverheadType',
  overheadPercent: 'OverheadPercent',
  overheadBase: 'OverheadBase',
  overheadAmount: 'OverheadAmount',
  currency: 'Currency',
  productCode: 'ProductCode',
  productName: 'ProductName',
  productDescription: 'ProductDescription',
} as const;

export const OVERHEAD_TYPES = ['none', 'percentage', 'fixed'] as const;
export const OVERHEAD_BASES = ['material', 'conversion', 'prime', 'total'] as const;
