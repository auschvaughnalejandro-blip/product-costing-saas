/** Entry point: start the HTTP server. */
import { createApp } from './app';
import { config } from './config';
import { createDatabase, usingPglite } from './db/pool';
import { runMigrations } from './db/migrate';
import { logger } from './lib/logger';

async function main(): Promise<void> {
  const { db, close } = await createDatabase();

  // The in-process PGlite demo database is empty on boot, so migrate it
  // automatically. A real Postgres is migrated explicitly via `npm run db:migrate`.
  if (usingPglite()) {
    await runMigrations(db);
    logger.info('Using in-process PGlite database (zero-setup demo mode).');
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
