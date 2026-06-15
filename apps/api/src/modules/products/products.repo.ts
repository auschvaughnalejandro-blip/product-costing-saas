/**
 * Product persistence. Saves a product's BOM tree, routing, and rate settings as
 * editable rows, and loads them back into the engine's input format. Materials
 * are referenced by code from the master `materials` table — never duplicated.
 */
import type { BomNode, CostInput, Operation, OverheadRule } from '@costing/shared';
import type { Database, Queryable } from '../../db/pool';
import { newId } from '../../lib/ids';
import { badRequest, notFound } from '../../lib/http';
import { getMaterialsByCodes } from '../materials/materials.repo';
import type { ProductDefinition, ProductDefinitionInput, ProductRateSettings, ProductSummary } from './types';

interface ProductRow {
  id: string;
  code: string;
  name: string;
  description: string | null;
  currency: string;
  updated_at: string;
}
interface PartRow {
  id: string;
  parent_id: string | null;
  node_key: string;
  name: string;
  quantity: string;
  unit: string | null;
  material_id: string | null;
  sort_order: number;
}
interface OpRow {
  op_key: string;
  part_id: string;
  name: string;
  machine_time: string;
  labour_time: string;
  machine_rate_code: string | null;
  labour_rate_code: string | null;
}
interface RatesRow {
  labour_rate: string;
  machine_rate: string;
  overhead_type: 'none' | 'percentage' | 'fixed';
  overhead_percent: string | null;
  overhead_base: 'material' | 'conversion' | 'prime' | 'total' | null;
  overhead_amount: string | null;
}
interface NamedRateRow {
  kind: 'labour' | 'machine';
  code: string;
  rate: string;
}

/** Unique list of material codes referenced anywhere in a BOM tree. */
export function collectMaterialCodes(node: BomNode, acc: Set<string> = new Set()): string[] {
  if (node.materialId) acc.add(node.materialId);
  for (const child of node.children ?? []) collectMaterialCodes(child, acc);
  return [...acc];
}

function rowToOverhead(row: RatesRow | undefined): OverheadRule {
  if (!row) return { type: 'none' };
  switch (row.overhead_type) {
    case 'percentage':
      return { type: 'percentage', percent: row.overhead_percent ?? '0', base: row.overhead_base ?? 'conversion' };
    case 'fixed':
      return { type: 'fixed', amount: row.overhead_amount ?? '0' };
    default:
      return { type: 'none' };
  }
}

// ── save ──────────────────────────────────────────────────────────────────────

/**
 * Create or replace a product definition. The current editable rows are replaced
 * wholesale; immutable history is kept separately in `cost_versions`.
 */
export async function saveProduct(
  db: Database,
  tenantId: string,
  userId: string | null,
  input: ProductDefinitionInput,
): Promise<string> {
  const codes = collectMaterialCodes(input.bom);
  const materials = await getMaterialsByCodes(db, tenantId, codes);
  const missing = codes.filter((c) => !materials.has(c));
  if (missing.length) {
    throw badRequest(
      `These materials are referenced but not defined: ${missing.join(', ')}. Add them first.`,
      { missing },
    );
  }

  return db.transaction(async (tx) => {
    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO products (id, tenant_id, code, name, description, currency, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (tenant_id, code) DO UPDATE SET
         name = EXCLUDED.name,
         description = EXCLUDED.description,
         currency = EXCLUDED.currency,
         updated_at = now()
       RETURNING id`,
      [
        newId(),
        tenantId,
        input.code,
        input.name,
        input.description ?? null,
        input.currency ?? input.rates.currency ?? 'USD',
        userId,
      ],
    );
    const id = rows[0]!.id;

    // Replace existing definition rows.
    await tx.query('DELETE FROM operations WHERE product_id = $1', [id]);
    await tx.query('DELETE FROM product_named_rates WHERE product_id = $1', [id]);
    await tx.query('DELETE FROM product_parts WHERE product_id = $1', [id]);

    // Insert parts (parents before children) so the self-FK is satisfied.
    const keyToUuid = new Map<string, string>();
    const insertNode = async (node: BomNode, parentUuid: string | null, sort: number): Promise<void> => {
      if (keyToUuid.has(node.id)) {
        throw badRequest(`Duplicate part id "${node.id}" in the bill of materials.`);
      }
      const uuid = newId();
      keyToUuid.set(node.id, uuid);
      const materialId = node.materialId ? materials.get(node.materialId)!.id : null;
      await tx.query(
        `INSERT INTO product_parts
           (id, tenant_id, product_id, parent_id, node_key, name, quantity, unit, material_id, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [uuid, tenantId, id, parentUuid, node.id, node.name, String(node.quantity), node.unit ?? null, materialId, sort],
      );
      const children = node.children ?? [];
      for (let i = 0; i < children.length; i += 1) {
        await insertNode(children[i]!, uuid, i);
      }
    };
    await insertNode(input.bom, null, 0);

    // Operations.
    let opSort = 0;
    for (const op of input.routing) {
      const partUuid = keyToUuid.get(op.partId);
      if (!partUuid) {
        throw badRequest(`Operation "${op.name}" refers to unknown part "${op.partId}".`);
      }
      await tx.query(
        `INSERT INTO operations
           (id, tenant_id, product_id, part_id, op_key, name, machine_time, labour_time, machine_rate_code, labour_rate_code, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          newId(),
          tenantId,
          id,
          partUuid,
          op.id,
          op.name,
          String(op.machineTime),
          String(op.labourTime),
          op.machineRateId ?? null,
          op.labourRateId ?? null,
          opSort,
        ],
      );
      opSort += 1;
    }

    // Rate settings.
    const oh = input.rates.overhead;
    await tx.query(
      `INSERT INTO product_rates
         (product_id, tenant_id, labour_rate, machine_rate, overhead_type, overhead_percent, overhead_base, overhead_amount, currency)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (product_id) DO UPDATE SET
         labour_rate = EXCLUDED.labour_rate,
         machine_rate = EXCLUDED.machine_rate,
         overhead_type = EXCLUDED.overhead_type,
         overhead_percent = EXCLUDED.overhead_percent,
         overhead_base = EXCLUDED.overhead_base,
         overhead_amount = EXCLUDED.overhead_amount,
         currency = EXCLUDED.currency`,
      [
        id,
        tenantId,
        String(input.rates.labourRate),
        String(input.rates.machineRate),
        oh.type,
        oh.type === 'percentage' ? String(oh.percent) : null,
        oh.type === 'percentage' ? oh.base ?? 'conversion' : null,
        oh.type === 'fixed' ? String(oh.amount) : null,
        input.rates.currency ?? input.currency ?? 'USD',
      ],
    );

    // Named rates.
    for (const [kind, map] of [
      ['labour', input.rates.labourRates],
      ['machine', input.rates.machineRates],
    ] as const) {
      for (const [code, rate] of Object.entries(map ?? {})) {
        await tx.query(
          `INSERT INTO product_named_rates (id, tenant_id, product_id, kind, code, rate)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [newId(), tenantId, id, kind, code, String(rate)],
        );
      }
    }

    return id;
  });
}

// ── load ──────────────────────────────────────────────────────────────────────

export async function loadProductDefinition(
  db: Queryable,
  tenantId: string,
  productId: string,
): Promise<ProductDefinition | null> {
  const product = (
    await db.query<ProductRow>('SELECT * FROM products WHERE tenant_id = $1 AND id = $2', [
      tenantId,
      productId,
    ])
  ).rows[0];
  if (!product) return null;

  const parts = (
    await db.query<PartRow>(
      'SELECT * FROM product_parts WHERE product_id = $1 ORDER BY sort_order ASC, created_at ASC',
      [productId],
    )
  ).rows;
  const ops = (
    await db.query<OpRow>('SELECT * FROM operations WHERE product_id = $1 ORDER BY sort_order ASC', [
      productId,
    ])
  ).rows;
  const ratesRow = (
    await db.query<RatesRow>('SELECT * FROM product_rates WHERE product_id = $1', [productId])
  ).rows[0];
  const named = (
    await db.query<NamedRateRow>('SELECT kind, code, rate FROM product_named_rates WHERE product_id = $1', [
      productId,
    ])
  ).rows;

  // Map material uuids back to codes (the engine works in codes).
  const materialIds = parts.map((p) => p.material_id).filter((x): x is string => Boolean(x));
  const matIdToCode = new Map<string, string>();
  if (materialIds.length) {
    const matRows = (
      await db.query<{ id: string; code: string }>(
        'SELECT id, code FROM materials WHERE tenant_id = $1 AND id = ANY($2)',
        [tenantId, materialIds],
      )
    ).rows;
    for (const m of matRows) matIdToCode.set(m.id, m.code);
  }

  // Rebuild the BOM tree.
  const childrenByParent = new Map<string | null, PartRow[]>();
  for (const p of parts) {
    const arr = childrenByParent.get(p.parent_id) ?? [];
    arr.push(p);
    childrenByParent.set(p.parent_id, arr);
  }
  const buildNode = (row: PartRow): BomNode => {
    const node: BomNode = { id: row.node_key, name: row.name, quantity: row.quantity };
    if (row.unit) node.unit = row.unit;
    if (row.material_id) node.materialId = matIdToCode.get(row.material_id);
    const kids = childrenByParent.get(row.id) ?? [];
    if (kids.length) node.children = kids.map(buildNode);
    return node;
  };
  const rootRow = (childrenByParent.get(null) ?? [])[0];
  if (!rootRow) throw notFound('Product has no bill of materials.');
  const bom = buildNode(rootRow);

  // Routing.
  const uuidToKey = new Map(parts.map((p) => [p.id, p.node_key]));
  const routing: Operation[] = ops.map((o) => {
    const op: Operation = {
      id: o.op_key,
      name: o.name,
      partId: uuidToKey.get(o.part_id)!,
      machineTime: o.machine_time,
      labourTime: o.labour_time,
    };
    if (o.machine_rate_code) op.machineRateId = o.machine_rate_code;
    if (o.labour_rate_code) op.labourRateId = o.labour_rate_code;
    return op;
  });

  // Rates.
  const labourRates: Record<string, string> = {};
  const machineRates: Record<string, string> = {};
  for (const n of named) {
    (n.kind === 'labour' ? labourRates : machineRates)[n.code] = n.rate;
  }
  const rates: ProductRateSettings = {
    labourRate: ratesRow?.labour_rate ?? '0',
    machineRate: ratesRow?.machine_rate ?? '0',
    overhead: rowToOverhead(ratesRow),
    currency: product.currency,
  };
  if (Object.keys(labourRates).length) rates.labourRates = labourRates;
  if (Object.keys(machineRates).length) rates.machineRates = machineRates;

  const def: ProductDefinition = {
    id: product.id,
    code: product.code,
    name: product.name,
    currency: product.currency,
    bom,
    routing,
    rates,
  };
  if (product.description) def.description = product.description;
  return def;
}

/** Load a product straight into the engine's input format. */
export async function loadCostInput(
  db: Queryable,
  tenantId: string,
  productId: string,
): Promise<CostInput | null> {
  const def = await loadProductDefinition(db, tenantId, productId);
  if (!def) return null;

  const codes = collectMaterialCodes(def.bom);
  const mats = await getMaterialsByCodes(db, tenantId, codes);
  const materials: CostInput['rates']['materials'] = {};
  for (const code of codes) {
    const m = mats.get(code);
    if (m) materials[code] = { unitPrice: m.unitPrice, ...(m.unit ? { unit: m.unit } : {}) };
  }

  return {
    product: def.bom,
    routing: def.routing,
    rates: {
      materials,
      labourRate: def.rates.labourRate,
      machineRate: def.rates.machineRate,
      overhead: def.rates.overhead,
      ...(def.rates.labourRates ? { labourRates: def.rates.labourRates } : {}),
      ...(def.rates.machineRates ? { machineRates: def.rates.machineRates } : {}),
      currency: def.rates.currency,
    },
    currency: def.currency,
  };
}

export async function listProducts(db: Queryable, tenantId: string): Promise<ProductSummary[]> {
  const { rows } = await db.query<ProductRow>(
    'SELECT * FROM products WHERE tenant_id = $1 ORDER BY updated_at DESC',
    [tenantId],
  );
  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    description: r.description,
    currency: r.currency,
    updatedAt: r.updated_at,
  }));
}

export async function getProductByCode(
  db: Queryable,
  tenantId: string,
  code: string,
): Promise<ProductRow | null> {
  const { rows } = await db.query<ProductRow>(
    'SELECT * FROM products WHERE tenant_id = $1 AND code = $2',
    [tenantId, code],
  );
  return rows[0] ?? null;
}
