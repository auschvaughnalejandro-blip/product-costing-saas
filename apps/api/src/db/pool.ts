/**
 * Database access. A tiny abstraction (`Database`) so the same repository code
 * runs against:
 *   - a real PostgreSQL pool in production, and
 *   - an in-process Postgres (PGlite) for tests and zero-setup local demos
 *     (set DATABASE_URL=pglite, or pglite:./path to persist to disk).
 * They share identical SQL.
 */
import pg from 'pg';
import { config } from '../config';

const { Pool } = pg;

/** Anything that can run a parameterised query ($1, $2, ...). */
export interface Queryable {
  query<R = Record<string, unknown>>(
    text: string,
    params?: readonly unknown[],
  ): Promise<{ rows: R[] }>;
}

/** A database that can also run a unit of work in a transaction. */
export interface Database extends Queryable {
  transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T>;
}

export interface DatabaseHandle {
  db: Database;
  close: () => Promise<void>;
}

class PgDatabase implements Database {
  constructor(private readonly pool: pg.Pool) {}

  async query<R = Record<string, unknown>>(text: string, params?: readonly unknown[]) {
    const res = await this.pool.query(text, params as unknown[]);
    return { rows: res.rows as R[] };
  }

  async transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const tx: Queryable = {
        query: async (text, params) => {
          const res = await client.query(text, params as unknown[]);
          return { rows: res.rows };
        },
      };
      const result = await fn(tx);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}

/** True when configured to use the in-process PGlite database. */
export function usingPglite(): boolean {
  return config.db.url === 'pglite' || config.db.url.startsWith('pglite:') || config.db.url === 'memory';
}

/** Create the application database based on DATABASE_URL. */
export async function createDatabase(): Promise<DatabaseHandle> {
  if (usingPglite()) {
    const { createPgliteDatabase } = await import('./pglite');
    return createPgliteDatabase(config.db.url);
  }
  const pool = new Pool({ connectionString: config.db.url, max: 10 });
  return { db: new PgDatabase(pool), close: () => pool.end() };
}
