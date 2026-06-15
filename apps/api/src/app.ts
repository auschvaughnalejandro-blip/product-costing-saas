/**
 * Express application factory.
 *
 * The API is a *coordinator*: it handles HTTP, auth, and persistence, and hands
 * any cost calculation to the pure engine. It never computes cost figures itself.
 */
import express, { type Express } from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import type { HealthResponse } from '@costing/shared';
import { config } from './config';
import { errorHandler, notFoundHandler } from './lib/http';

export function createApp(): Express {
  const app = express();

  app.use(helmet());
  app.use(
    cors({
      origin: config.webOrigins,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '10mb' }));
  app.use(cookieParser());

  // Health check — proves the browser → API wiring end to end.
  app.get('/api/health', (_req, res) => {
    const body: HealthResponse = {
      status: 'ok',
      service: 'costing-api',
      time: new Date().toISOString(),
      version: '1.0.0',
    };
    res.json(body);
  });

  // Feature routers are mounted here in later phases (auth, products, versions,
  // quotations, approvals, assistant, ...).
  // registerRoutes(app, deps);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
