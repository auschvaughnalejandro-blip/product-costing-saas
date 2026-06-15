/**
 * Authentication middleware. The auth token is carried in an httpOnly cookie
 * (with a Bearer-header fallback for tooling/tests). Every authenticated request
 * carries the tenant id, which the data layer uses to scope every query.
 */
import type { CookieOptions, NextFunction, Request, Response } from 'express';
import { config } from '../config';
import { forbidden, unauthorized } from '../lib/http';
import { verifyToken } from '../lib/jwt';
import type { UserRole } from '../modules/users/users.repo';

export interface AuthUser {
  id: string;
  tenantId: string;
  role: UserRole;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export const AUTH_COOKIE = 'token';

export function authCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: config.isProduction ? 'none' : 'lax',
    path: '/',
    maxAge: 1000 * 60 * 60 * 24 * 7,
  };
}

function readToken(req: Request): string | undefined {
  const cookie = (req.cookies as Record<string, string> | undefined)?.[AUTH_COOKIE];
  if (cookie) return cookie;
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7);
  return undefined;
}

/** Populate req.user if a valid token is present. Never rejects on its own. */
export function authMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const token = readToken(req);
  if (token) {
    try {
      const payload = verifyToken(token);
      req.user = { id: payload.sub, tenantId: payload.tid, role: payload.role };
    } catch {
      // Invalid/expired token — treated as anonymous.
    }
  }
  next();
}

/** Reject unless a user is authenticated. */
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) {
    next(unauthorized());
    return;
  }
  next();
}

/** Reject unless the authenticated user has one of the given roles. */
export function requireRole(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(unauthorized());
      return;
    }
    if (!roles.includes(req.user.role)) {
      next(forbidden('You do not have permission to do that.'));
      return;
    }
    next();
  };
}

/** The authenticated user; only call after requireAuth. */
export function currentUser(req: Request): AuthUser {
  if (!req.user) throw unauthorized();
  return req.user;
}
