/**
 * Idempotent development seed: a demo tenant, an admin user, the example
 * material prices, and the worked-example Widget product with one saved cost
 * version. Run with `npm run db:seed`.
 */
import { computeCost, widgetExample } from '../engine';
import { ensureDefaultTenant } from '../modules/tenants/tenants.repo';
import { countUsers, createUser, getUserByEmail } from '../modules/users/users.repo';
import { upsertMaterial } from '../modules/materials/materials.repo';
import { saveProduct } from '../modules/products/products.repo';
import { createCostVersion, listCostVersions } from '../modules/versions/versions.repo';
import { closeDb, getDb } from './pool';
import { logger } from '../lib/logger';

const DEMO_EMAIL = 'admin@demo.test';
const DEMO_PASSWORD = 'password123';

async function seed(): Promise<void> {
  const db = getDb();

  const tenant = await ensureDefaultTenant(db, 'Demo Manufacturing Co.');
  logger.info(`Tenant: ${tenant.name} (${tenant.id})`);

  let user = await getUserByEmail(db, tenant.id, DEMO_EMAIL);
  if (!user) {
    user = {
      ...(await createUser(db, tenant.id, {
        email: DEMO_EMAIL,
        name: 'Demo Admin',
        password: DEMO_PASSWORD,
        role: 'admin',
      })),
      passwordHash: '',
    };
    logger.info(`Created admin user ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
  }
  await countUsers(db, tenant.id);

  const example = widgetExample();
  for (const [code, m] of Object.entries(example.rates.materials)) {
    await upsertMaterial(db, tenant.id, {
      code,
      name: code,
      unit: m.unit ?? null,
      unitPrice: m.unitPrice,
      source: 'manual',
    });
  }
  logger.info('Seeded material prices.');

  const productId = await saveProduct(db, tenant.id, user.id, {
    code: 'WIDGET',
    name: 'Widget',
    description: 'Worked-example product used in the build plan.',
    currency: 'USD',
    bom: example.product,
    routing: example.routing,
    rates: {
      labourRate: example.rates.labourRate,
      machineRate: example.rates.machineRate,
      overhead: example.rates.overhead,
      currency: 'USD',
    },
  });
  logger.info(`Saved product WIDGET (${productId}).`);

  const existingVersions = await listCostVersions(db, tenant.id, productId);
  if (existingVersions.length === 0) {
    const result = computeCost(example);
    await createCostVersion(db, tenant.id, user.id, {
      productId,
      name: 'Initial costing',
      kind: 'draft',
      input: example,
      result,
    });
    logger.info(`Saved initial cost version (total ${result.total.total}).`);
  }

  logger.info('Seed complete.');
}

seed()
  .then(() => closeDb())
  .then(() => process.exit(0))
  .catch((err) => {
    logger.error('Seed failed', err);
    closeDb().finally(() => process.exit(1));
  });
