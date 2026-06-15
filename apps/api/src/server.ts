/** Entry point: start the HTTP server. */
import { createApp } from './app';
import { config } from './config';
import { logger } from './lib/logger';

const app = createApp();

const server = app.listen(config.port, () => {
  logger.info(`Costing API listening on http://localhost:${config.port} (${config.env})`);
});

// Graceful shutdown.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    logger.info(`Received ${signal}, shutting down...`);
    server.close(() => process.exit(0));
  });
}
