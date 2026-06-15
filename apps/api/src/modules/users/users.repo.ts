import type { Queryable } from '../../db/pool';
import { newId } from '../../lib/ids';
import { hashPassword } from '../../lib/password';

export type UserRole = 'admin' | 'estimator' | 'approver' | 'viewer';

export interface User {
  id: string;
  tenantId: string;
  email: string;
  name: string;
  role: UserRole;
}

interface UserRow {
  id: string;
  tenant_id: string;
  email: string;
  password_hash: string;
  name: string;
  role: UserRole;
}

function toUser(row: UserRow): User {
  return { id: row.id, tenantId: row.tenant_id, email: row.email, name: row.name, role: row.role };
}

export interface CreateUserInput {
  email: string;
  name: string;
  password: string;
  role?: UserRole;
}

export async function createUser(
  db: Queryable,
  tenantId: string,
  input: CreateUserInput,
): Promise<User> {
  const id = newId();
  const email = input.email.trim().toLowerCase();
  const passwordHash = await hashPassword(input.password);
  const role = input.role ?? 'estimator';
  await db.query(
    `INSERT INTO users (id, tenant_id, email, password_hash, name, role)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, tenantId, email, passwordHash, input.name, role],
  );
  return { id, tenantId, email, name: input.name, role };
}

export async function getUserByEmail(
  db: Queryable,
  tenantId: string,
  email: string,
): Promise<(User & { passwordHash: string }) | null> {
  const { rows } = await db.query<UserRow>(
    'SELECT * FROM users WHERE tenant_id = $1 AND email = $2',
    [tenantId, email.trim().toLowerCase()],
  );
  const row = rows[0];
  return row ? { ...toUser(row), passwordHash: row.password_hash } : null;
}

export async function getUserById(
  db: Queryable,
  tenantId: string,
  id: string,
): Promise<User | null> {
  const { rows } = await db.query<UserRow>('SELECT * FROM users WHERE tenant_id = $1 AND id = $2', [
    tenantId,
    id,
  ]);
  return rows[0] ? toUser(rows[0]) : null;
}

export async function countUsers(db: Queryable, tenantId: string): Promise<number> {
  const { rows } = await db.query<{ count: string }>(
    'SELECT COUNT(*)::int AS count FROM users WHERE tenant_id = $1',
    [tenantId],
  );
  return Number(rows[0]?.count ?? 0);
}
