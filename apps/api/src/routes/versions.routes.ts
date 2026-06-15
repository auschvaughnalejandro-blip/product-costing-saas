import { Router } from 'express';
import { z } from 'zod';
import type { Database } from '../db/pool';
import { asyncHandler, forbidden, notFound } from '../lib/http';
import { currentUser, requireAuth } from '../middleware/auth';
import { getCostVersion } from '../modules/versions/versions.repo';
import { listApprovalEvents } from '../modules/approvals/approvals.repo';
import { applyTransition, nextActions } from '../modules/approvals/approvals.service';

const TransitionSchema = z.object({
  action: z.enum(['submit', 'approve', 'reject']),
  comment: z.string().optional(),
});

export function versionsRouter(db: Database): Router {
  const r = Router();
  r.use(requireAuth);

  // Full version record, including stored input/result snapshots and the actions
  // currently available in the approval workflow.
  r.get(
    '/:id',
    asyncHandler(async (req, res) => {
      const version = await getCostVersion(db, currentUser(req).tenantId, req.params.id);
      if (!version) throw notFound('Version not found.');
      res.json({ version, nextActions: nextActions(version.status) });
    }),
  );

  // The approval history (who did what, when).
  r.get(
    '/:id/approvals',
    asyncHandler(async (req, res) => {
      const events = await listApprovalEvents(db, currentUser(req).tenantId, req.params.id);
      res.json({ events });
    }),
  );

  // Move the version through the workflow. Only valid transitions are allowed.
  r.post(
    '/:id/transition',
    asyncHandler(async (req, res) => {
      const user = currentUser(req);
      const { action, comment } = TransitionSchema.parse(req.body);

      if ((action === 'approve' || action === 'reject') && !['admin', 'approver'].includes(user.role)) {
        throw forbidden('Only an approver can approve or reject.');
      }
      if (action === 'submit' && !['admin', 'estimator'].includes(user.role)) {
        throw forbidden('Only an estimator can submit for approval.');
      }

      const status = await applyTransition(db, user.tenantId, user.id, req.params.id, action, comment);
      const version = await getCostVersion(db, user.tenantId, req.params.id);
      res.json({ version, nextActions: nextActions(status) });
    }),
  );

  return r;
}
