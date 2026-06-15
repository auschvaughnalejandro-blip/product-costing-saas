/**
 * Database access. A tiny abstraction (`Database`) so the same repository code
 * runs against a real PostgreSQL pool in production and an in-process Postgres
 * (PGlite) in tests — they share identical SQL.
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

let instance: { db: Database; pool: pg.Pool } | null = null;

/** The shared application database (lazy singleton). */
export function getDb(): Database {
  if (!instance) {
    const pool = new Pool({ connectionString: config.db.url, max: 10 });
    instance = { db: new PgDatabase(pool), pool };
  }
  return instance.db;
}

export async function closeDb(): Promise<void> {
  if (instance) {
    await instance.pool.end();
    instance = null;
  }
}
