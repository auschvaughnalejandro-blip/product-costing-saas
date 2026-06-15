import { Router } from 'express';
import { z } from 'zod';
import type { Database } from '../db/pool';
import { asyncHandler, notFound } from '../lib/http';
import { currentUser, requireAuth, requireRole } from '../middleware/auth';
import {
  createQuotation,
  getQuotation,
  listQuotations,
} from '../modules/quotations/quotations.repo';
import { getCostVersion } from '../modules/versions/versions.repo';

const CreateQuotationSchema = z.object({
  costVersionId: z.string().min(1),
  number: z.string().optional(),
  customerName: z.string().min(1),
  customerContact: z.string().optional(),
  customerAddress: z.string().optional(),
  marginType: z.enum(['percent', 'amount']),
  marginValue: z.union([z.number(), z.string()]),
  terms: z.string().optional(),
  notes: z.string().optional(),
});

export function quotationsRouter(db: Database): Router {
  const r = Router();
  r.use(requireAuth);

  r.get(
    '/',
    asyncHandler(async (req, res) => {
      res.json({ quotations: await listQuotations(db, currentUser(req).tenantId) });
    }),
  );

  r.post(
    '/',
    requireRole('admin', 'estimator'),
    asyncHandler(async (req, res) => {
      const user = currentUser(req);
      const body = CreateQuotationSchema.parse(req.body);
      const quotation = await createQuotation(db, user.tenantId, user.id, body);
      res.status(201).json({ quotation });
    }),
  );

  r.get(
    '/:id',
    asyncHandler(async (req, res) => {
      const user = currentUser(req);
      const quotation = await getQuotation(db, user.tenantId, req.params.id);
      if (!quotation) throw notFound('Quotation not found.');
      // Include the linked cost version so the quote can show the costing it traces to.
      const version = await getCostVersion(db, user.tenantId, quotation.costVersionId);
      res.json({ quotation, version });
    }),
  );

  return r;
}
