import type { Request, Response } from 'express';
import { MulterError } from 'multer';
import { describe, expect, it } from 'vitest';
import { errorHandler } from './http';

/** Minimal Response stand-in that records the status/body the handler sets. */
function fakeRes(): Response & { statusCode: number; body: { error?: string; message?: string } } {
  const res = {
    statusCode: 0,
    body: {} as { error?: string; message?: string },
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: { error?: string; message?: string }) {
      this.body = payload;
      return this;
    },
  };
  return res as unknown as Response & {
    statusCode: number;
    body: { error?: string; message?: string };
  };
}

describe('errorHandler — failure mapping (the gotchas)', () => {
  it('maps an oversized upload to a clear 413 (not a crash)', () => {
    const res = fakeRes();
    errorHandler(new MulterError('LIMIT_FILE_SIZE'), {} as Request, res, () => undefined);
    expect(res.statusCode).toBe(413);
    expect(res.body.error).toBe('upload_error');
    expect(res.body.message).toMatch(/\d+ MB/); // names the configured limit
  });

  it('maps any other multer error to a clean 400', () => {
    const res = fakeRes();
    errorHandler(new MulterError('LIMIT_UNEXPECTED_FILE'), {} as Request, res, () => undefined);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('upload_error');
  });

  it('maps a lost database connection to a 503 retry message (not a 500)', () => {
    const res = fakeRes();
    const dbErr = Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:5432'), {
      code: 'ECONNREFUSED',
    });
    errorHandler(dbErr, {} as Request, res, () => undefined);
    expect(res.statusCode).toBe(503);
    expect(res.body.error).toBe('service_unavailable');
    expect(res.body.message).toMatch(/try again/i);
  });

  it('still maps an unknown error to a generic 500', () => {
    const res = fakeRes();
    errorHandler(new Error('boom'), {} as Request, res, () => undefined);
    expect(res.statusCode).toBe(500);
    expect(res.body.error).toBe('internal_error');
  });
});
