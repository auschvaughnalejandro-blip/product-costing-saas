import { Router } from 'express';
import { z } from 'zod';
import type { Database } from '../db/pool';
import { asyncHandler, conflict, forbidden, unauthorized } from '../lib/http';
import { signToken } from '../lib/jwt';
import { verifyPassword } from '../lib/password';
import { AUTH_COOKIE, authCookieOptions, currentUser, requireAuth } from '../middleware/auth';
import { ensureDefaultTenant, getDefaultTenant } from '../modules/tenants/tenants.repo';
import {
  countUsers,
  createUser,
  getUserByEmail,
  getUserById,
  type UserRole,
} from '../modules/users/users.repo';
import type { Response } from 'express';

const LoginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });
const RegisterSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  password: z.string().min(8, 'Password must be at least 8 characters.'),
});

function issueSession(res: Response, userId: string, tenantId: string, role: UserRole): void {
  res.cookie(AUTH_COOKIE, signToken({ sub: userId, tid: tenantId, role }), authCookieOptions());
}

export function authRouter(db: Database): Router {
  const r = Router();

  r.post(
    '/register',
    asyncHandler(async (req, res) => {
      const body = RegisterSchema.parse(req.body);
      const tenant = await ensureDefaultTenant(db);

      if (await getUserByEmail(db, tenant.id, body.email)) {
        throw conflict('A user with that email already exists.');
      }

      // Bootstrap: the very first user becomes admin. After that, only an admin
      // may add users.
      const userCount = await countUsers(db, tenant.id);
      if (userCount > 0 && req.user?.role !== 'admin') {
        throw forbidden('Only an admin can add new users.');
      }
      const role: UserRole = userCount === 0 ? 'admin' : 'estimator';

      const user = await createUser(db, tenant.id, { ...body, role });
      issueSession(res, user.id, tenant.id, role);
      res.status(201).json({ user });
    }),
  );

  r.post(
    '/login',
    asyncHandler(async (req, res) => {
      const body = LoginSchema.parse(req.body);
      const tenant = await getDefaultTenant(db);
      const user = tenant ? await getUserByEmail(db, tenant.id, body.email) : null;
      if (!user || !(await verifyPassword(body.password, user.passwordHash))) {
        throw unauthorized('Invalid email or password.');
      }
      issueSession(res, user.id, user.tenantId, user.role);
      res.json({
        user: {
          id: user.id,
          tenantId: user.tenantId,
          email: user.email,
          name: user.name,
          role: user.role,
        },
      });
    }),
  );

  r.post('/logout', (_req, res) => {
    res.clearCookie(AUTH_COOKIE, { path: '/' });
    res.json({ ok: true });
  });

  r.get(
    '/me',
    requireAuth,
    asyncHandler(async (req, res) => {
      const u = currentUser(req);
      const user = await getUserById(db, u.tenantId, u.id);
      if (!user) throw unauthorized();
      res.json({ user });
    }),
  );

  return r;
}
