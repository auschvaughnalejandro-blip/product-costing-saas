/**
 * Cost versions — immutable snapshots of a costing. Each version stores the exact
 * engine input and the exact engine result as JSONB, so a saved cost is fully
 * self-contained and can never be silently changed. Drafts and finals are kept
 * distinct by `kind`; the approval `status` is advanced in Phase 9.
 */
import type { CostInput, CostResult } from '@costing/shared';
import type { Database, Queryable } from '../../db/pool';
import { newId } from '../../lib/ids';

export type CostVersionKind = 'draft' | 'final';
export type CostVersionStatus = 'draft' | 'submitted' | 'approved' | 'rejected';

export interface CostVersionInput {
  productId: string;
  name: string;
  kind: CostVersionKind;
  input: CostInput;
  result: CostResult;
  notes?: string | null;
}

export interface CostVersionSummary {
  id: string;
  productId: string;
  versionNo: number;
  name: string;
  kind: CostVersionKind;
  status: CostVersionStatus;
  currency: string;
  totalCost: string;
  notes: string | null;
  createdBy: string | null;
  createdAt: string;
}

export interface CostVersionRecord extends CostVersionSummary {
  input: CostInput;
  result: CostResult;
}

interface SummaryRow {
  id: string;
  product_id: string;
  version_no: number;
  name: string;
  kind: CostVersionKind;
  status: CostVersionStatus;
  currency: string;
  total_cost: string;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}
interface RecordRow extends SummaryRow {
  input_json: CostInput;
  result_json: CostResult;
}

function toSummary(row: SummaryRow): CostVersionSummary {
  return {
    id: row.id,
    productId: row.product_id,
    versionNo: row.version_no,
    name: row.name,
    kind: row.kind,
    status: row.status,
    currency: row.currency,
    totalCost: row.total_cost,
    notes: row.notes,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

/** Save a new immutable cost version, allocating the next version number. */
export async function createCostVersion(
  db: Database,
  tenantId: string,
  userId: string | null,
  input: CostVersionInput,
): Promise<CostVersionRecord> {
  return db.transaction(async (tx) => {
    const next = (
      await tx.query<{ next: number }>(
        'SELECT COALESCE(MAX(version_no), 0) + 1 AS next FROM cost_versions WHERE product_id = $1',
        [input.productId],
      )
    ).rows[0]!.next;

    const id = newId();
    const { rows } = await tx.query<RecordRow>(
      `INSERT INTO cost_versions
         (id, tenant_id, product_id, version_no, name, kind, status, input_json, result_json, currency, total_cost, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, 'draft', $7::jsonb, $8::jsonb, $9, $10, $11, $12)
       RETURNING *`,
      [
        id,
        tenantId,
        input.productId,
        next,
        input.name,
        input.kind,
        JSON.stringify(input.input),
        JSON.stringify(input.result),
        input.result.currency,
        input.result.total.total,
        input.notes ?? null,
        userId,
      ],
    );
    const row = rows[0]!;
    return { ...toSummary(row), input: row.input_json, result: row.result_json };
  });
}

export async function listCostVersions(
  db: Queryable,
  tenantId: string,
  productId: string,
): Promise<CostVersionSummary[]> {
  const { rows } = await db.query<SummaryRow>(
    `SELECT id, product_id, version_no, name, kind, status, currency, total_cost, notes, created_by, created_at
     FROM cost_versions WHERE tenant_id = $1 AND product_id = $2 ORDER BY version_no DESC`,
    [tenantId, productId],
  );
  return rows.map(toSummary);
}

export async function getCostVersion(
  db: Queryable,
  tenantId: string,
  versionId: string,
): Promise<CostVersionRecord | null> {
  const { rows } = await db.query<RecordRow>(
    'SELECT * FROM cost_versions WHERE tenant_id = $1 AND id = $2',
    [tenantId, versionId],
  );
  const row = rows[0];
  return row ? { ...toSummary(row), input: row.input_json, result: row.result_json } : null;
}

export async function updateCostVersionStatus(
  db: Queryable,
  tenantId: string,
  versionId: string,
  status: CostVersionStatus,
): Promise<void> {
  await db.query('UPDATE cost_versions SET status = $3 WHERE tenant_id = $1 AND id = $2', [
    tenantId,
    versionId,
    status,
  ]);
}
