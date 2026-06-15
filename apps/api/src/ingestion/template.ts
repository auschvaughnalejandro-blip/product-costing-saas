/**
 * Write a workbook in the standard format. Used to generate the downloadable
 * template / worked example, by tests, and (Phase 10) by the AI assistant to
 * produce a corrected file for the user to approve.
 */
import ExcelJS from 'exceljs';
import { COLUMNS, SHEETS } from './format';

export interface WorkbookSpec {
  materials: Record<string, string | number>[];
  parts: Record<string, string | number>[];
  operations?: Record<string, string | number>[];
  namedRates?: Record<string, string | number>[];
  settings: Record<string, string | number>;
}

function addTable(
  wb: ExcelJS.Workbook,
  sheetName: string,
  columns: readonly string[],
  rows: Record<string, string | number>[],
): void {
  const ws = wb.addWorksheet(sheetName);
  ws.addRow(columns as string[]);
  ws.getRow(1).font = { bold: true };
  for (const row of rows) {
    ws.addRow(columns.map((c) => row[c] ?? ''));
  }
  ws.columns.forEach((col) => {
    col.width = 16;
  });
}

export async function writeWorkbook(spec: WorkbookSpec): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Product Costing SaaS';

  addTable(wb, SHEETS.materials, COLUMNS.materials, spec.materials);
  addTable(wb, SHEETS.parts, COLUMNS.parts, spec.parts);
  addTable(wb, SHEETS.operations, COLUMNS.operations, spec.operations ?? []);
  if (spec.namedRates && spec.namedRates.length) {
    addTable(wb, SHEETS.namedRates, COLUMNS.namedRates, spec.namedRates);
  }

  const settings = wb.addWorksheet(SHEETS.settings);
  settings.addRow(['Key', 'Value']);
  settings.getRow(1).font = { bold: true };
  for (const [key, value] of Object.entries(spec.settings)) {
    settings.addRow([key, value]);
  }
  settings.columns.forEach((col) => {
    col.width = 22;
  });

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

/** The worked-example workbook (the Widget) — costs to exactly 108.00. */
export function sampleWorkbookSpec(): WorkbookSpec {
  return {
    materials: [
      { Code: 'STEEL', Name: 'Steel sheet', Unit: 'kg', UnitPrice: 5, Currency: 'USD' },
      { Code: 'BOLT', Name: 'Bolt M6', Unit: 'pcs', UnitPrice: 0.25, Currency: 'USD' },
      { Code: 'PLASTIC', Name: 'ABS cover', Unit: 'kg', UnitPrice: 8, Currency: 'USD' },
    ],
    parts: [
      { NodeId: 'WIDGET', ParentId: '', Name: 'Widget', Quantity: 1, Unit: 'pcs' },
      { NodeId: 'FRAME', ParentId: 'WIDGET', Name: 'Frame', Quantity: 2, Unit: 'pcs', MaterialCode: 'STEEL' },
      { NodeId: 'BOLT', ParentId: 'FRAME', Name: 'Bolt', Quantity: 4, Unit: 'pcs', MaterialCode: 'BOLT' },
      { NodeId: 'COVER', ParentId: 'WIDGET', Name: 'Cover', Quantity: 1, Unit: 'pcs', MaterialCode: 'PLASTIC' },
    ],
    operations: [
      { OpId: 'OP1', PartId: 'FRAME', Name: 'Machine frame', MachineTime: 1, LabourTime: 0.5 },
    ],
    settings: {
      ProductCode: 'WIDGET',
      ProductName: 'Widget',
      ProductDescription: 'Worked example from the build plan.',
      LabourRate: 20,
      MachineRate: 30,
      OverheadType: 'percentage',
      OverheadPercent: 10,
      OverheadBase: 'conversion',
      Currency: 'USD',
    },
  };
}

export function buildTemplateBuffer(): Promise<Buffer> {
  return writeWorkbook(sampleWorkbookSpec());
}
