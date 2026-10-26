import { createApp } from './app.js';
import { PORT, validateEnvironment } from './config.js';
import { runMigrations } from './db/migrate.js';
import pool from './db/pool.js';
import logger from './logger.js';
import { notify } from './services/Alerter.js';
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

  // Errors that never reach Express: a rejected promise nobody awaited, or a
  // throw off the request path (a timer, a socket handler, the backup
  // scheduler). Previously these only ever hit stdout.
  process.on('unhandledRejection', (reason: unknown) => {
    logger.error({ reason }, 'Unhandled promise rejection');
    notify(reason, { operation: 'process:unhandledRejection' });
  });

  // An uncaught exception leaves the process in an undefined state, so this
  // reports and exits rather than limping on — Render restarts it. The delay
  // only exists to give the webhook POST a chance to leave the box.
  process.on('uncaughtException', (err: Error) => {
    logger.fatal({ err }, 'Uncaught exception — exiting');
    notify(err, { operation: 'process:uncaughtException' });
    setTimeout(() => process.exit(1), 1000).unref();
  });
}

main().catch((err: unknown) => {
  logger.error({ err }, 'Fatal startup error');
  process.exit(1);
});
