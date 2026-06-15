/**
 * PGlite adapter — a full PostgreSQL compiled to WebAssembly that runs in-process.
 * Used by tests and by the zero-setup local demo mode (DATABASE_URL=pglite).
 * PGlite is loaded via dynamic import so it isn't pulled into production builds
 * that use a real Postgres.
 */
import type { PGlite } from '@electric-sql/pglite';
import type { Database, DatabaseHandle, Queryable } from './pool';

interface PgliteQueryable {
  query: (text: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
}

function wrap(q: PgliteQueryable): Queryable {
  return {
    async query<R = Record<string, unknown>>(text: string, params?: readonly unknown[]) {
      const result = await q.query(text, params as unknown[]);
      return { rows: result.rows as R[] };
    },
  };
}

export class PgliteDatabase implements Database {
  constructor(private readonly pg: PGlite) {}

  query<R = Record<string, unknown>>(text: string, params?: readonly unknown[]) {
    return wrap(this.pg).query<R>(text, params);
  }

  transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T> {
    return this.pg.transaction(async (tx) => fn(wrap(tx))) as Promise<T>;
  }
}

/**
 * Create a PGlite-backed database. `url` of "pglite" (or "memory") is in-memory;
 * "pglite:./some/dir" persists to that directory.
 */
export async function createPgliteDatabase(url = 'pglite'): Promise<DatabaseHandle> {
  const { PGlite } = await import('@electric-sql/pglite');
  const dir =
    url === 'pglite' || url === 'memory' || url === 'pglite:memory'
      ? undefined
      : url.replace(/^pglite:/, '');
  const pg = dir ? new PGlite(dir) : new PGlite();
  return { db: new PgliteDatabase(pg), close: () => pg.close() };
}
