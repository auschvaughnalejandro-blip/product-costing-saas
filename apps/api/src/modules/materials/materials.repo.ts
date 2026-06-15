import type { Numeric } from '@costing/shared';
import type { Queryable } from '../../db/pool';
import { newId } from '../../lib/ids';

export type MaterialSource = 'manual' | 'excel' | 'sap';

export interface Material {
  id: string;
  code: string;
  name: string;
  unit: string | null;
  unitPrice: string;
  currency: string;
  source: MaterialSource;
  description: string | null;
}

export interface MaterialInput {
  code: string;
  name: string;
  unit?: string | null;
  unitPrice: Numeric;
  currency?: string;
  source?: MaterialSource;
  description?: string | null;
}

interface MaterialRow {
  id: string;
  code: string;
  name: string;
  unit: string | null;
  unit_price: string;
  currency: string;
  source: MaterialSource;
  description: string | null;
}

function toMaterial(row: MaterialRow): Material {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    unit: row.unit,
    unitPrice: row.unit_price,
    currency: row.currency,
    source: row.source,
    description: row.description,
  };
}

/** Insert or update a material price (keyed by code within the tenant). */
export async function upsertMaterial(
  db: Queryable,
  tenantId: string,
  input: MaterialInput,
): Promise<Material> {
  const id = newId();
  const { rows } = await db.query<MaterialRow>(
    `INSERT INTO materials (id, tenant_id, code, name, unit, unit_price, currency, source, description)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (tenant_id, code) DO UPDATE SET
       name = EXCLUDED.name,
       unit = EXCLUDED.unit,
       unit_price = EXCLUDED.unit_price,
       currency = EXCLUDED.currency,
       source = EXCLUDED.source,
       description = EXCLUDED.description,
       updated_at = now()
     RETURNING *`,
    [
      id,
      tenantId,
      input.code,
      input.name,
      input.unit ?? null,
      String(input.unitPrice),
      input.currency ?? 'USD',
      input.source ?? 'manual',
      input.description ?? null,
    ],
  );
  return toMaterial(rows[0]!);
}

export async function listMaterials(db: Queryable, tenantId: string): Promise<Material[]> {
  const { rows } = await db.query<MaterialRow>(
    'SELECT * FROM materials WHERE tenant_id = $1 ORDER BY code ASC',
    [tenantId],
  );
  return rows.map(toMaterial);
}

export async function getMaterialsByCodes(
  db: Queryable,
  tenantId: string,
  codes: string[],
): Promise<Map<string, Material>> {
  if (codes.length === 0) return new Map();
  const { rows } = await db.query<MaterialRow>(
    'SELECT * FROM materials WHERE tenant_id = $1 AND code = ANY($2)',
    [tenantId, codes],
  );
  return new Map(rows.map((r) => [r.code, toMaterial(r)]));
}
