/** HTTP helpers: a typed application error, async wrapper, and error middleware. */
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { MulterError } from 'multer';
import { ZodError } from 'zod';
import type { ApiError } from '@costing/shared';
import { config } from '../config';
import { EngineError } from '../engine/errors';
import { logger } from './logger';

/**
 * Error codes that mean "the database is unreachable / went away" rather than a
 * fault in our code. We translate these into a clean 503 so a DB blip mid-session
 * gives the user a retry message instead of crashing the request.
 */
const DB_UNAVAILABLE_CODES = new Set([
  'ECONNREFUSED', // nothing listening
  'ECONNRESET',
  'ETIMEDOUT',
  'ENOTFOUND', // host can't be resolved
  'EPIPE',
  '08000', // connection_exception
  '08001', // sqlclient_unable_to_establish_sqlconnection
  '08003', // connection_does_not_exist
  '08004', // sqlserver_rejected_establishment_of_sqlconnection
  '08006', // connection_failure
  '57P01', // admin_shutdown
  '57P03', // cannot_connect_now
  '53300', // too_many_connections
]);

function isDatabaseUnavailable(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const code = (err as { code?: unknown }).code;
  return typeof code === 'string' && DB_UNAVAILABLE_CODES.has(code);
}

/** An error with an HTTP status and a stable machine-readable code. */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new AppError(400, 'bad_request', message, details);
export const unauthorized = (message = 'Not authenticated') =>
  new AppError(401, 'unauthorized', message);
export const forbidden = (message = 'Not allowed') => new AppError(403, 'forbidden', message);
export const notFound = (message = 'Not found') => new AppError(404, 'not_found', message);
export const conflict = (message: string, details?: unknown) =>
  new AppError(409, 'conflict', message, details);

/** Wrap an async route handler so thrown errors reach the error middleware. */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}

/** 404 handler for unmatched routes. */
export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(new AppError(404, 'not_found', `No route for ${req.method} ${req.path}`));
}

/** Central error handler — turns any thrown error into a clean JSON response. */
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  // Zod validation errors → 400 with a plain-language list of problems.
  if (err instanceof ZodError) {
    const body: ApiError = {
      error: 'validation_error',
      message: 'Some of the data you sent is invalid.',
      details: err.flatten(),
    };
    res.status(400).json(body);
    return;
  }

  // Engine errors are bad-input errors, never server faults: surface as 400 with
  // the engine's plain-language message and stable code.
  if (err instanceof EngineError) {
    const body: ApiError = {
      error: 'engine_error',
      message: err.message,
      details: { code: err.code, ...(err.context ? { context: err.context } : {}) },
    };
    res.status(400).json(body);
    return;
  }

  if (err instanceof AppError) {
    const body: ApiError = { error: err.code, message: err.message, details: err.details };
    res.status(err.status).json(body);
    return;
  }

  // File-upload errors from multer → clear, plain-language messages (never a crash).
  if (err instanceof MulterError) {
    const message =
      err.code === 'LIMIT_FILE_SIZE'
        ? `That file is too large. The maximum upload size is ${config.upload.maxMb} MB.`
        : `The file upload failed: ${err.message}.`;
    const body: ApiError = {
      error: 'upload_error',
      message,
      details: { code: err.code },
    };
    res.status(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json(body);
    return;
  }

  // Database went away mid-request → 503 with a retry message, not a 500 crash.
  if (isDatabaseUnavailable(err)) {
    logger.error('Database unavailable', err);
    const body: ApiError = {
      error: 'service_unavailable',
      message: 'The service is temporarily unavailable (database connection lost). Please try again shortly.',
    };
    res.status(503).json(body);
    return;
  }

  logger.error('Unhandled error', err);
  const body: ApiError = {
    error: 'internal_error',
    message: 'Something went wrong on our side.',
  };
  res.status(500).json(body);
}
