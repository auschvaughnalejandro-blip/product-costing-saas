import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { computeCost } from '../engine/costing';
import { ingestExcel, mappedToCostInput, sampleWorkbookSpec, writeWorkbook } from './index';
import { parseWorkbook } from './parse';

describe('parse — Excel gotchas (merged cells, empty rows, large files)', () => {
  it('resolves a merged cell to its master value (not undefined)', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Materials');
    ws.addRow(['Code', 'Name', 'Unit', 'UnitPrice', 'Currency']);
    // Put a value only in the master cell, then merge it across the next column —
    // exactly how Excel stores a merged region (value in the first cell, blanks
    // in the rest).
    ws.getCell('A2').value = 'STEEL';
    ws.getCell('B2').value = 'Steel sheet';
    ws.getCell('D2').value = 5;
    ws.getCell('E2').value = 'USD';
    ws.mergeCells('B2:C2'); // C2 (Unit) is now a blank slave of B2

    const buffer = Buffer.from(await wb.xlsx.writeBuffer());
    const raw = await parseWorkbook(buffer);
    const row = raw.materials.rows[0];

    expect(row.values['Name']).toBe('Steel sheet');
    // The merged-over Unit cell resolves to the master's value rather than blank.
    expect(row.values['Unit']).toBe('Steel sheet');
  });

  it('strips completely empty rows so they never reach validation', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Materials');
    ws.addRow(['Code', 'Name', 'UnitPrice']);
    ws.addRow(['STEEL', 'Steel sheet', 5]);
    ws.addRow([]); // blank row in the middle
    ws.addRow(['BOLT', 'Bolt', 0.25]);
    ws.addRow([]); // trailing blank row

    const buffer = Buffer.from(await wb.xlsx.writeBuffer());
    const raw = await parseWorkbook(buffer);
    // Two data rows survive; the blanks are gone.
    expect(raw.materials.rows).toHaveLength(2);
    expect(raw.materials.rows.map((r) => r.values['Code'])).toEqual(['STEEL', 'BOLT']);
  });

  it('parses a large file (600+ rows) without timing out, and still costs to 108.00', async () => {
    const spec = sampleWorkbookSpec();
    for (let i = 0; i < 600; i += 1) {
      spec.materials.push({ Code: `EXTRA-${i}`, Name: `Extra ${i}`, Unit: 'kg', UnitPrice: 1, Currency: 'USD' });
    }
    const result = await ingestExcel(await writeWorkbook(spec));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.materials.length).toBeGreaterThan(600);
    const cost = computeCost(mappedToCostInput(result));
    expect(cost.total.total).toBe('108.00'); // the extra materials are unused
  });
});
