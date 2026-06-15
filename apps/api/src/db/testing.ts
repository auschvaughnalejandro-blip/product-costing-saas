/**
 * Test database backed by PGlite — a full PostgreSQL compiled to WebAssembly that
 * runs in-process. Tests get a real, migrated Postgres without Docker, running the
 * exact same SQL as the production node-postgres pool.
 *
 * This file is only imported by tests; PGlite is a dev dependency.
 */
import { PGlite } from '@electric-sql/pglite';
import type { Database, Queryable } from './pool';
import { runMigrations } from './migrate';

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

class PgliteDatabase implements Database {
  constructor(private readonly pg: PGlite) {}

  query<R = Record<string, unknown>>(text: string, params?: readonly unknown[]) {
    return wrap(this.pg).query<R>(text, params);
  }

  transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T> {
    return this.pg.transaction(async (tx) => fn(wrap(tx))) as Promise<T>;
  }
}

export interface TestDb {
  db: Database;
  close: () => Promise<void>;
}

/** Create a fresh, migrated in-memory database for a test. */
export async function createTestDb(): Promise<TestDb> {
  const pg = new PGlite();
  const db = new PgliteDatabase(pg);
  await runMigrations(db);
  return { db, close: () => pg.close() };
}
