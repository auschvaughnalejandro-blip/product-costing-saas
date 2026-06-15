import { Router } from 'express';
import { z } from 'zod';
import type { Database } from '../db/pool';
import { AppError, asyncHandler } from '../lib/http';
import { currentUser, requireAuth, requireRole } from '../middleware/auth';
import { computeCost } from '../engine';
import { mappedToCostInput } from '../ingestion';
import {
  getSapConnector,
  ingestFromSap,
  isSapError,
  sapStatus,
  SapNotConfiguredError,
} from '../integrations/sap';
import { upsertMaterial } from '../modules/materials/materials.repo';
import { saveProduct } from '../modules/products/products.repo';

const ImportSchema = z.object({
  material: z.string().min(1, 'A material number is required.'),
  dryRun: z.boolean().optional(),
});

/** Translate a SAP connection error into a clean 503 the UI can show plainly. */
function asHttp(err: unknown): never {
  if (isSapError(err)) {
    const status = err instanceof SapNotConfiguredError ? 409 : 503;
    throw new AppError(status, err.code, err.message);
  }
  throw err;
}

export function sapRouter(db: Database): Router {
  const r = Router();
  r.use(requireAuth);

  // Is SAP wired up? The app works on Excel either way; the UI uses this to show
  // or hide the "Import from SAP" action.
  r.get('/status', (_req, res) => {
    res.json(sapStatus());
  });

  // Pull a material's costed BOM from SAP and cost it through the SAME engine as
  // Excel. On clean data the product is saved (unless dryRun); bad SAP data
  // returns a 422 with a structured problem list; an unreachable SAP returns 503.
  r.post(
    '/import',
    requireRole('admin', 'estimator'),
    asyncHandler(async (req, res) => {
      const user = currentUser(req);
      const { material, dryRun } = ImportSchema.parse(req.body);

      const result = await ingestFromSap(getSapConnector(), material).catch(asHttp);
      if (!result.ok) {
        res.status(422).json({ ok: false, source: 'sap', errors: result.errors });
        return;
      }

      const cost = computeCost(mappedToCostInput(result));
      if (dryRun) {
        res.json({
          ok: true,
          source: 'sap',
          dryRun: true,
          product: result.product,
          materials: result.materials,
          result: cost,
        });
        return;
      }

      for (const m of result.materials) {
        await upsertMaterial(db, user.tenantId, m);
      }
      const productId = await saveProduct(db, user.tenantId, user.id, result.product);
      res.status(201).json({ ok: true, source: 'sap', productId, result: cost });
    }),
  );

  return r;
}
