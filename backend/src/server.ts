import { createApp } from './app.js';
import { env } from './config/env.js';
import { disconnectDatabase } from './config/database.js';
import { logger } from './config/logger.js';

const app = createApp();
const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, 'Nilopasal API listening');
});

const shutdown = async (signal: string) => {
  logger.info({ signal }, 'Shutting down Nilopasal API');
  server.close(async () => {
    await disconnectDatabase();
    process.exit(0);
  });
};

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
