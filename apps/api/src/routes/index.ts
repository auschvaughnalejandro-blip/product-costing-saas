import type { Express } from 'express';
import type { Database } from '../db/pool';
import { assistantRouter } from './assistant.routes';
import { authRouter } from './auth.routes';
import { materialsRouter } from './materials.routes';
import { productsRouter } from './products.routes';
import { quotationsRouter } from './quotations.routes';
import { sapRouter } from './sap.routes';
import { uploadsRouter } from './uploads.routes';
import { versionsRouter } from './versions.routes';

export interface RouteDeps {
  db: Database;
}

/** Mount all feature routers under /api. */
export function registerRoutes(app: Express, deps: RouteDeps): void {
  const { db } = deps;
  app.use('/api/auth', authRouter(db));
  app.use('/api/materials', materialsRouter(db));
  app.use('/api/products', productsRouter(db));
  app.use('/api/versions', versionsRouter(db));
  app.use('/api/quotations', quotationsRouter(db));
  app.use('/api/uploads', uploadsRouter(db));
  app.use('/api/sap', sapRouter(db));
  app.use('/api/assistant', assistantRouter());
}
