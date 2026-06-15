import type { Queryable } from '../../db/pool';
import { newId } from '../../lib/ids';
import type { CostVersionStatus } from '../versions/versions.repo';

export type ApprovalAction = 'submit' | 'approve' | 'reject';

export interface ApprovalEvent {
  id: string;
  action: ApprovalAction;
  fromStatus: CostVersionStatus;
  toStatus: CostVersionStatus;
  actorId: string | null;
  actorName: string | null;
  comment: string | null;
  createdAt: string;
}

interface Row {
  id: string;
  action: ApprovalAction;
  from_status: CostVersionStatus;
  to_status: CostVersionStatus;
  actor_id: string | null;
  actor_name: string | null;
  comment: string | null;
  created_at: string;
}

export async function addApprovalEvent(
  db: Queryable,
  tenantId: string,
  e: {
    costVersionId: string;
    action: ApprovalAction;
    fromStatus: CostVersionStatus;
    toStatus: CostVersionStatus;
    actorId: string | null;
    comment?: string | null;
  },
): Promise<void> {
  await db.query(
    `INSERT INTO approval_events
       (id, tenant_id, cost_version_id, action, from_status, to_status, actor_id, comment)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [newId(), tenantId, e.costVersionId, e.action, e.fromStatus, e.toStatus, e.actorId, e.comment ?? null],
  );
}

export async function listApprovalEvents(
  db: Queryable,
  tenantId: string,
  versionId: string,
): Promise<ApprovalEvent[]> {
  const { rows } = await db.query<Row>(
    `SELECT ae.id, ae.action, ae.from_status, ae.to_status, ae.actor_id, ae.comment, ae.created_at,
            u.name AS actor_name
     FROM approval_events ae
     LEFT JOIN users u ON u.id = ae.actor_id
     WHERE ae.tenant_id = $1 AND ae.cost_version_id = $2
     ORDER BY ae.created_at ASC`,
    [tenantId, versionId],
  );
  return rows.map((r) => ({
    id: r.id,
    action: r.action,
    fromStatus: r.from_status,
    toStatus: r.to_status,
    actorId: r.actor_id,
    actorName: r.actor_name,
    comment: r.comment,
    createdAt: r.created_at,
  }));
}
