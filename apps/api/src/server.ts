/** Entry point: start the HTTP server. */
import { createApp } from './app';
import { config } from './config';
import { createDatabase, usingPglite } from './db/pool';
import { runMigrations } from './db/migrate';
import { logger } from './lib/logger';

async function main(): Promise<void> {
  const { db, close } = await createDatabase();

  // The in-process PGlite demo database is empty on boot, so always migrate it.
  // A real Postgres is normally migrated explicitly via `npm run db:migrate`, but
  // set MIGRATE_ON_START=true (the Docker image does) for a self-contained boot.
  if (usingPglite()) {
    await runMigrations(db);
    logger.info('Using in-process PGlite database (zero-setup demo mode).');
  } else if (config.migrateOnStart) {
    const applied = await runMigrations(db);
    logger.info(
      applied.length
        ? `Applied ${applied.length} migration(s) on start.`
        : 'Database already up to date.',
    );
  }

  const app = createApp({ db });
  const server = app.listen(config.port, () => {
    logger.info(`Costing API listening on http://localhost:${config.port} (${config.env})`);
  });

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => {
      logger.info(`Received ${signal}, shutting down...`);
      server.close(() => {
        void close().then(() => process.exit(0));
      });
    });
  }
}

main().catch((err) => {
  logger.error('Failed to start server', err);
  process.exit(1);
});
