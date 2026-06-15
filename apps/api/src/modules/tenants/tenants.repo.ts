import type { Queryable } from '../../db/pool';
import { newId } from '../../lib/ids';

export interface Tenant {
  id: string;
  name: string;
}

export async function createTenant(db: Queryable, name: string): Promise<Tenant> {
  const id = newId();
  await db.query('INSERT INTO tenants (id, name) VALUES ($1, $2)', [id, name]);
  return { id, name };
}

export async function getDefaultTenant(db: Queryable): Promise<Tenant | null> {
  const { rows } = await db.query<{ id: string; name: string }>(
    'SELECT id, name FROM tenants ORDER BY created_at ASC LIMIT 1',
  );
  return rows[0] ?? null;
}

/** Get the single tenant, creating it if the system has none yet. */
export async function ensureDefaultTenant(db: Queryable, name = 'Default'): Promise<Tenant> {
  return (await getDefaultTenant(db)) ?? createTenant(db, name);
}
