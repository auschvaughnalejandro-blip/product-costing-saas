import { Router } from 'express';
import type { Database } from '../db/pool';
import { asyncHandler, notFound } from '../lib/http';
import { currentUser, requireAuth } from '../middleware/auth';
import { getCostVersion } from '../modules/versions/versions.repo';

export function versionsRouter(db: Database): Router {
  const r = Router();
  r.use(requireAuth);

  // Full version record, including the stored engine input and result snapshots.
  r.get(
    '/:id',
    asyncHandler(async (req, res) => {
      const version = await getCostVersion(db, currentUser(req).tenantId, req.params.id);
      if (!version) throw notFound('Version not found.');
      res.json({ version });
    }),
  );

  return r;
}
