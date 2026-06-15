import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { computeCost } from '../engine/costing';
import {
  ingestExcel,
  mappedToCostInput,
  sampleWorkbookSpec,
  writeWorkbook,
  type WorkbookSpec,
} from './index';

describe('excel ingestion — correctly-formatted file', () => {
  it('produces a fully costed product end to end (108.00)', async () => {
    const buffer = await writeWorkbook(sampleWorkbookSpec());
    const result = await ingestExcel(buffer);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.materials).toHaveLength(3);
    expect(result.product.code).toBe('WIDGET');

    const cost = computeCost(mappedToCostInput(result));
    expect(cost.total.total).toBe('108.00');
  });

  it('round-trips the BOM tree structure', async () => {
    const result = await ingestExcel(await writeWorkbook(sampleWorkbookSpec()));
    if (!result.ok) throw new Error('expected ok');
    expect(result.product.bom.id).toBe('WIDGET');
    expect(result.product.bom.children?.map((c) => c.id)).toEqual(['FRAME', 'COVER']);
    expect(result.product.bom.children?.[0]?.children?.[0]?.id).toBe('BOLT');
  });
});

describe('excel ingestion — malformed file returns clear problems', () => {
  it('reports bad numbers, broken references, and a missing root', async () => {
    const spec: WorkbookSpec = {
      materials: [{ Code: 'M', Name: 'Steel', UnitPrice: '' }], // blank price
      parts: [
        // No root (every part has a parent), bad quantity, broken parent + material refs.
        { NodeId: 'A', ParentId: 'GHOST', Name: 'A', Quantity: 'lots', MaterialCode: 'MISSING' },
      ],
      settings: {
        // Missing ProductCode / ProductName / rates / overhead type.
        Currency: 'USD',
      },
    };
    const result = await ingestExcel(await writeWorkbook(spec));

    expect(result.ok).toBe(false);
    if (result.ok) return;

    const codes = result.errors.map((e) => e.code);
    expect(codes).toContain('required'); // blank price, missing settings
    expect(codes).toContain('not_a_number'); // quantity "lots"
    expect(codes).toContain('broken_reference'); // parent GHOST / material MISSING
    expect(codes).toContain('no_root'); // no part with blank ParentId
    // Every problem is a plain-language string the user can act on.
    for (const e of result.errors) {
      expect(typeof e.message).toBe('string');
      expect(e.message.length).toBeGreaterThan(0);
    }
  });

  it('reports missing required sheets', async () => {
    // A workbook with only a Materials sheet — Parts and Settings are missing.
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Materials');
    ws.addRow(['Code', 'Name', 'UnitPrice']);
    ws.addRow(['M', 'Steel', 5]);
    const buffer = Buffer.from(await wb.xlsx.writeBuffer());

    const result = await ingestExcel(buffer);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const missingSheets = result.errors.filter((e) => e.code === 'missing_sheet').map((e) => e.sheet);
    expect(missingSheets).toContain('Parts');
    expect(missingSheets).toContain('Settings');
  });

  it('detects a circular part reference', async () => {
    const spec: WorkbookSpec = {
      materials: [{ Code: 'M', Name: 'M', UnitPrice: 1 }],
      parts: [
        { NodeId: 'A', ParentId: 'B', Name: 'A', Quantity: 1 },
        { NodeId: 'B', ParentId: 'A', Name: 'B', Quantity: 1 },
      ],
      settings: {
        ProductCode: 'P',
        ProductName: 'P',
        LabourRate: 0,
        MachineRate: 0,
        OverheadType: 'none',
      },
    };
    const result = await ingestExcel(await writeWorkbook(spec));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.map((e) => e.code)).toContain('circular_reference');
  });
});
