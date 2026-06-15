/**
 * The approval state machine. A cost version moves draft → submitted →
 * approved/rejected, and only valid transitions are allowed — an item can never
 * jump to an invalid state. Designed so more steps can be added later by
 * extending the rules table.
 */
import type { Database } from '../../db/pool';
import { badRequest, notFound } from '../../lib/http';
import {
  getCostVersion,
  updateCostVersionStatus,
  type CostVersionStatus,
} from '../versions/versions.repo';
import { addApprovalEvent, type ApprovalAction } from './approvals.repo';

const RULES: Record<ApprovalAction, { from: CostVersionStatus[]; to: CostVersionStatus }> = {
  submit: { from: ['draft', 'rejected'], to: 'submitted' },
  approve: { from: ['submitted'], to: 'approved' },
  reject: { from: ['submitted'], to: 'rejected' },
};

/** The actions available from a given status. */
export function nextActions(status: CostVersionStatus): ApprovalAction[] {
  return (Object.keys(RULES) as ApprovalAction[]).filter((a) => RULES[a].from.includes(status));
}

export async function applyTransition(
  db: Database,
  tenantId: string,
  actorId: string | null,
  versionId: string,
  action: ApprovalAction,
  comment?: string,
): Promise<CostVersionStatus> {
  const version = await getCostVersion(db, tenantId, versionId);
  if (!version) throw notFound('Version not found.');

  const rule = RULES[action];
  if (!rule.from.includes(version.status)) {
    throw badRequest(`Can't ${action} a version that is "${version.status}".`);
  }

  await db.transaction(async (tx) => {
    await updateCostVersionStatus(tx, tenantId, versionId, rule.to);
    await addApprovalEvent(tx, tenantId, {
      costVersionId: versionId,
      action,
      fromStatus: version.status,
      toStatus: rule.to,
      actorId,
      comment,
    });
  });

  return rule.to;
}
