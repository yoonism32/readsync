import { createApp } from './app.js';
import { PORT, validateEnvironment } from './config.js';
import { runMigrations } from './db/migrate.js';
import pool from './db/pool.js';
import logger from './logger.js';
import { startBackupScheduler } from './services/BackupService.js';

async function main(): Promise<void> {
  validateEnvironment();
  await runMigrations();

  const { httpServer, io } = createApp();

  httpServer.listen(PORT, '0.0.0.0', () => {
    logger.info({ port: PORT }, 'ReadSync API server running');
  });

  startBackupScheduler();

  const shutdown = (signal: string): void => {
    logger.info({ signal }, 'Graceful shutdown started');
    httpServer.close(() => {
      io.close();
      void pool.end().then(() => {
        logger.info('Database pool closed');
        process.exit(0);
      });
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err: unknown) => {
  logger.error({ err }, 'Fatal startup error');
  process.exit(1);
});
