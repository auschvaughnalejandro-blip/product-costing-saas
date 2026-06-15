import { Router } from 'express';
import { z } from 'zod';
import type { Database } from '../db/pool';
import { asyncHandler } from '../lib/http';
import { currentUser, requireAuth, requireRole } from '../middleware/auth';
import { listMaterials, upsertMaterial } from '../modules/materials/materials.repo';

const MaterialSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  unit: z.string().nullish(),
  unitPrice: z.union([z.number(), z.string()]),
  currency: z.string().optional(),
  description: z.string().nullish(),
});

export function materialsRouter(db: Database): Router {
  const r = Router();
  r.use(requireAuth);

  r.get(
    '/',
    asyncHandler(async (req, res) => {
      res.json({ materials: await listMaterials(db, currentUser(req).tenantId) });
    }),
  );

  r.post(
    '/',
    requireRole('admin', 'estimator'),
    asyncHandler(async (req, res) => {
      const body = MaterialSchema.parse(req.body);
      const material = await upsertMaterial(db, currentUser(req).tenantId, body);
      res.status(201).json({ material });
    }),
  );

  return r;
}
