import { afterEach, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../../db/testing';
import { computeCost } from '../../engine/costing';
import { widgetExample } from '../../engine/examples';
import { createTenant } from '../tenants/tenants.repo';
import { createUser } from '../users/users.repo';
import { upsertMaterial } from '../materials/materials.repo';
import { loadCostInput, saveProduct } from './products.repo';

describe('product persistence round-trip', () => {
  let h: TestDb | undefined;
  afterEach(async () => {
    await h?.close();
    h = undefined;
  });

  it('stores a product and reloads it so the engine produces the same result', async () => {
    h = await createTestDb();
    const { db } = h;
    const tenant = await createTenant(db, 'Acme');
    const user = await createUser(db, tenant.id, {
      email: 'a@b.com',
      name: 'Estimator',
      password: 'secret123',
      role: 'admin',
    });

    const example = widgetExample();

    // Seed the master-data material prices the product references.
    for (const [code, m] of Object.entries(example.rates.materials)) {
      await upsertMaterial(db, tenant.id, {
        code,
        name: code,
        unit: m.unit ?? null,
        unitPrice: m.unitPrice,
      });
    }

    const productId = await saveProduct(db, tenant.id, user.id, {
      code: 'WIDGET',
      name: 'Widget',
      bom: example.product,
      routing: example.routing,
      rates: {
        labourRate: example.rates.labourRate,
        machineRate: example.rates.machineRate,
        overhead: example.rates.overhead,
        currency: 'USD',
      },
      currency: 'USD',
    });

    const loaded = await loadCostInput(db, tenant.id, productId);
    expect(loaded).not.toBeNull();

    const fromStore = computeCost(loaded!);
    const fromMemory = computeCost(example);

    // The stored data produces the exact same cost figures as the in-memory data.
    expect(fromStore.total).toEqual(fromMemory.total);
    expect(fromStore.tree).toEqual(fromMemory.tree);
    expect(fromStore.total.total).toBe('108.00');
  });

  it('scopes products by tenant', async () => {
    h = await createTestDb();
    const { db } = h;
    const t1 = await createTenant(db, 'Tenant 1');
    const t2 = await createTenant(db, 'Tenant 2');
    await upsertMaterial(db, t1.id, { code: 'M', name: 'M', unitPrice: 5 });

    const pid = await saveProduct(db, t1.id, null, {
      code: 'P',
      name: 'P',
      bom: { id: 'P', name: 'P', quantity: 1, materialId: 'M' },
      routing: [],
      rates: { labourRate: 0, machineRate: 0, overhead: { type: 'none' } },
    });

    // The other tenant can't see it.
    expect(await loadCostInput(db, t2.id, pid)).toBeNull();
    // The owning tenant can.
    expect(await loadCostInput(db, t1.id, pid)).not.toBeNull();
  });

  it('rejects a product that references an undefined material', async () => {
    h = await createTestDb();
    const { db } = h;
    const t = await createTenant(db, 'T');
    await expect(
      saveProduct(db, t.id, null, {
        code: 'P',
        name: 'P',
        bom: { id: 'P', name: 'P', quantity: 1, materialId: 'GHOST' },
        routing: [],
        rates: { labourRate: 0, machineRate: 0, overhead: { type: 'none' } },
      }),
    ).rejects.toThrow(/not defined/);
  });
});
