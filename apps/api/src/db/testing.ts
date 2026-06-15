/**
 * Test database backed by PGlite. Each call gives a fresh, migrated, in-memory
 * Postgres — no Docker — running the exact same SQL as production node-postgres.
 */
import type { Database } from './pool';
import { createPgliteDatabase } from './pglite';
import { runMigrations } from './migrate';

export interface TestDb {
  db: Database;
  close: () => Promise<void>;
}

export async function createTestDb(): Promise<TestDb> {
  const { db, close } = await createPgliteDatabase('pglite');
  await runMigrations(db);
  return { db, close };
}
