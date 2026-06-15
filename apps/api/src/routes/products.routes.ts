import { Router } from 'express';
import { z } from 'zod';
import type { Database } from '../db/pool';
import { asyncHandler, notFound } from '../lib/http';
import { currentUser, requireAuth, requireRole } from '../middleware/auth';
import { computeCost } from '../engine';
import {
  listProducts,
  loadCostInput,
  loadProductDefinition,
  saveProduct,
} from '../modules/products/products.repo';
import {
  CostInputSchema,
  ProductDefinitionInputSchema,
  RecalculateSchema,
} from '../modules/products/schemas';
import { createCostVersion, listCostVersions } from '../modules/versions/versions.repo';

const CreateVersionSchema = z.object({
  name: z.string().min(1),
  kind: z.enum(['draft', 'final']).default('draft'),
  input: CostInputSchema.optional(),
  notes: z.string().optional(),
});

export function productsRouter(db: Database): Router {
  const r = Router();
  r.use(requireAuth);

  // List products (headers only).
  r.get(
    '/',
    asyncHandler(async (req, res) => {
      res.json({ products: await listProducts(db, currentUser(req).tenantId) });
    }),
  );

  // Create or replace a product definition; returns its current cost.
  r.post(
    '/',
    requireRole('admin', 'estimator'),
    asyncHandler(async (req, res) => {
      const user = currentUser(req);
      const body = ProductDefinitionInputSchema.parse(req.body);
      const id = await saveProduct(db, user.tenantId, user.id, body);
      const input = await loadCostInput(db, user.tenantId, id);
      res.status(201).json({ id, result: input ? computeCost(input) : null });
    }),
  );

  // Recalculate from an edited input — the what-if path. Uses the SAME engine as
  // every other calculation; nothing here re-implements cost maths.
  r.post(
    '/recalculate',
    asyncHandler(async (req, res) => {
      const { input } = RecalculateSchema.parse(req.body);
      res.json({ result: computeCost(input) });
    }),
  );

  // A product's editable definition.
  r.get(
    '/:id',
    asyncHandler(async (req, res) => {
      const def = await loadProductDefinition(db, currentUser(req).tenantId, req.params.id);
      if (!def) throw notFound('Product not found.');
      res.json({ product: def });
    }),
  );

  // A product's current cost (and the engine input that produced it).
  r.get(
    '/:id/cost',
    asyncHandler(async (req, res) => {
      const input = await loadCostInput(db, currentUser(req).tenantId, req.params.id);
      if (!input) throw notFound('Product not found.');
      res.json({ input, result: computeCost(input) });
    }),
  );

  // Versions for a product.
  r.get(
    '/:id/versions',
    asyncHandler(async (req, res) => {
      const versions = await listCostVersions(db, currentUser(req).tenantId, req.params.id);
      res.json({ versions });
    }),
  );

  // Save the current (or an edited) state as an immutable version snapshot.
  r.post(
    '/:id/versions',
    requireRole('admin', 'estimator'),
    asyncHandler(async (req, res) => {
      const user = currentUser(req);
      const body = CreateVersionSchema.parse(req.body);
      // Always confirm the product belongs to this tenant — even when an edited
      // input is supplied — so a version can never reference another tenant's
      // product. The stored snapshot is still the caller's input.
      const owned = await loadCostInput(db, user.tenantId, req.params.id);
      if (!owned) throw notFound('Product not found.');
      const input = body.input ?? owned;
      const result = computeCost(input);
      const version = await createCostVersion(db, user.tenantId, user.id, {
        productId: req.params.id,
        name: body.name,
        kind: body.kind,
        input,
        result,
        notes: body.notes ?? null,
      });
      res.status(201).json({ version });
    }),
  );

  return r;
}
