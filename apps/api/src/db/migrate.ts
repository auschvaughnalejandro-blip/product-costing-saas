/**
 * Migration runner. Applies any `*.sql` file in ./migrations that hasn't been
 * applied yet, in filename order, recording each in `schema_migrations`. Safe to
 * run repeatedly. Invoked by `npm run db:migrate`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Queryable } from './pool';
import { createDatabase } from './pool';
import { logger } from '../lib/logger';

const migrationsDir = fileURLToPath(new URL('./migrations', import.meta.url));

export interface MigrationFile {
  version: string;
  sql: string;
}

/**
 * Split a migration file into individual statements. Our migrations contain only
 * plain DDL (no functions or string literals with semicolons), so splitting on
 * `;` is safe — and it lets the same SQL run on node-postgres and PGlite alike
 * (PGlite's `query` executes one statement at a time).
 */
export function splitSqlStatements(sql: string): string[] {
  // Strip `--` line comments first (the DDL has no string literals containing
  // `--`, so this is safe), then split on the statement terminator. This keeps
  // each statement pure SQL, which both node-postgres and PGlite execute happily.
  const withoutComments = sql
    .split('\n')
    .map((line) => {
      const idx = line.indexOf('--');
      return idx >= 0 ? line.slice(0, idx) : line;
    })
    .join('\n');
  return withoutComments
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function loadMigrationFiles(dir: string = migrationsDir): MigrationFile[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => ({ version: f, sql: fs.readFileSync(path.join(dir, f), 'utf8') }));
}

/** Apply all pending migrations against the given database. Returns versions applied. */
export async function runMigrations(
  db: { query: Queryable['query']; transaction: <T>(fn: (tx: Queryable) => Promise<T>) => Promise<T> },
  dir: string = migrationsDir,
): Promise<string[]> {
  await db.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    );
  `);

  const applied = new Set(
    (await db.query<{ version: string }>('SELECT version FROM schema_migrations')).rows.map(
      (r) => r.version,
    ),
  );

  const pending = loadMigrationFiles(dir).filter((m) => !applied.has(m.version));
  const done: string[] = [];

  for (const migration of pending) {
    await db.transaction(async (tx) => {
      for (const statement of splitSqlStatements(migration.sql)) {
        await tx.query(statement);
      }
      await tx.query('INSERT INTO schema_migrations (version) VALUES ($1)', [migration.version]);
    });
    logger.info(`Applied migration ${migration.version}`);
    done.push(migration.version);
  }

  return done;
}

// Run as a script.
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  createDatabase()
    .then(async ({ db, close }) => {
      const applied = await runMigrations(db);
      logger.info(
        applied.length ? `Migrations complete (${applied.length} applied).` : 'No pending migrations.',
      );
      await close();
    })
    .then(() => process.exit(0))
    .catch((err) => {
      logger.error('Migration failed', err);
      process.exit(1);
    });
}
