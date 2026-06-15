import { afterEach, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../../db/testing';
import { computeCost, widgetExample } from '../../engine';
import { createTenant } from '../tenants/tenants.repo';
import { upsertMaterial } from '../materials/materials.repo';
import { saveProduct } from '../products/products.repo';
import { createCostVersion, getCostVersion, listCostVersions } from './versions.repo';

describe('cost versions', () => {
  let h: TestDb | undefined;
  afterEach(async () => {
    await h?.close();
    h = undefined;
  });

  it('keeps immutable, incrementing snapshots and distinguishes draft from final', async () => {
    h = await createTestDb();
    const { db } = h;
    const tenant = await createTenant(db, 'T');
    const example = widgetExample();
    for (const [code, m] of Object.entries(example.rates.materials)) {
      await upsertMaterial(db, tenant.id, { code, name: code, unit: m.unit ?? null, unitPrice: m.unitPrice });
    }
    const productId = await saveProduct(db, tenant.id, null, {
      code: 'W',
      name: 'W',
      bom: example.product,
      routing: example.routing,
      rates: {
        labourRate: example.rates.labourRate,
        machineRate: example.rates.machineRate,
        overhead: example.rates.overhead,
        currency: 'USD',
      },
    });
    const result = computeCost(example);

    const v1 = await createCostVersion(db, tenant.id, null, {
      productId,
      name: 'draft 1',
      kind: 'draft',
      input: example,
      result,
    });
    const v2 = await createCostVersion(db, tenant.id, null, {
      productId,
      name: 'final 1',
      kind: 'final',
      input: example,
      result,
    });

    expect(v1.versionNo).toBe(1);
    expect(v2.versionNo).toBe(2);
    expect(v1.kind).toBe('draft');
    expect(v2.kind).toBe('final');

    const list = await listCostVersions(db, tenant.id, productId);
    expect(list.map((v) => v.versionNo)).toEqual([2, 1]); // newest first

    // The stored snapshot reproduces exactly what was saved.
    const loaded = await getCostVersion(db, tenant.id, v1.id);
    expect(loaded?.result.total.total).toBe('108.00');
    expect(loaded?.input).toEqual(example);
  });
});
