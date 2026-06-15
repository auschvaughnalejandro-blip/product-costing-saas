import { Router } from 'express';
import multer from 'multer';
import type { Database } from '../db/pool';
import { asyncHandler, badRequest } from '../lib/http';
import { currentUser, requireAuth, requireRole } from '../middleware/auth';
import { computeCost } from '../engine';
import { buildTemplateBuffer, ingestExcel, mappedToCostInput } from '../ingestion';
import { upsertMaterial } from '../modules/materials/materials.repo';
import { saveProduct } from '../modules/products/products.repo';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

export function uploadsRouter(db: Database): Router {
  const r = Router();
  r.use(requireAuth);

  // Download the standard template (the worked example), generated from the spec.
  r.get(
    '/template',
    asyncHandler(async (_req, res) => {
      const buffer = await buildTemplateBuffer();
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      res.setHeader('Content-Disposition', 'attachment; filename="costing-template.xlsx"');
      res.send(buffer);
    }),
  );

  // Upload an Excel file. On a clean file the product is costed (and saved unless
  // ?dryRun=1). On a malformed file a 422 with a structured problem list comes
  // back — never a crash, and never a guessed number.
  r.post(
    '/excel',
    requireRole('admin', 'estimator'),
    upload.single('file'),
    asyncHandler(async (req, res) => {
      const user = currentUser(req);
      if (!req.file) throw badRequest('No file uploaded. Attach an .xlsx file as "file".');

      const result = await ingestExcel(req.file.buffer);
      if (!result.ok) {
        res.status(422).json({ ok: false, errors: result.errors });
        return;
      }

      const cost = computeCost(mappedToCostInput(result));
      const dryRun = req.query.dryRun === '1' || req.query.dryRun === 'true';
      if (dryRun) {
        res.json({ ok: true, dryRun: true, product: result.product, materials: result.materials, result: cost });
        return;
      }

      for (const material of result.materials) {
        await upsertMaterial(db, user.tenantId, material);
      }
      const productId = await saveProduct(db, user.tenantId, user.id, result.product);
      res.status(201).json({ ok: true, productId, result: cost });
    }),
  );

  return r;
}
