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
import { authMiddleware } from './middleware/auth';
import { registerRoutes, type RouteDeps } from './routes';

export type AppDeps = RouteDeps;

export function createApp(deps: AppDeps): Express {
  const app = express();

  app.use(helmet());
  // CORS must be applied before any routes so it covers every endpoint and the
  // browser's preflight requests. Allowed origins come from the environment
  // (ALLOWED_ORIGIN / WEB_ORIGIN) so dev and prod differ by config, not code.
  app.use(
    cors({
      origin: config.webOrigins,
      credentials: true,
    }),
  );
  // Body parsers sized from MAX_UPLOAD_MB. Excel uploads are multipart (handled
  // by multer), but large JSON recalculation payloads need the headroom too.
  const bodyLimit = `${config.upload.maxMb}mb`;
  app.use(express.json({ limit: bodyLimit }));
  app.use(express.urlencoded({ limit: bodyLimit, extended: true }));
  app.use(cookieParser());
  app.use(authMiddleware);

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

  registerRoutes(app, deps);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
