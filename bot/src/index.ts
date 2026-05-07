import pool from './db.js';
import { botService } from './services/BotService.js';
import { NovelScraper } from './services/NovelScraper.js';
import {
  initNotifications, safeUpdateCycle,
  updateNovelChapters, triggerManualUpdate, runSingleNovelOnly,
} from './bot.js';
import { GRACEFUL_SHUTDOWN_WAIT_SECONDS, CHECK_INTERVAL_MS, BATCH_SIZE, BATCH_INTERVAL_MS, STALE_THRESHOLD_HOURS } from './config.js';
import type { BotStatus } from './types/index.js';

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function getBotStatus(): BotStatus {
  return { ...botService.status };
}

export async function startBot(): Promise<void> {
  botService.log('info', 'ReadSync Chapter Update Bot Starting (PUPPETEER-CORE + CHROMIUM)...', {
    checkInterval: `${CHECK_INTERVAL_MS / 1000 / 60} minutes`,
    batchSize: BATCH_SIZE,
    batchInterval: `${BATCH_INTERVAL_MS / 1000 / 60} minutes`,
    staleThreshold: `${STALE_THRESHOLD_HOURS} hours`,
  });

  try {
    await pool.query('SELECT 1');
    botService.log('success', 'Database connected');

    await initNotifications();
    botService.log('success', 'Notifications system initialized');
  } catch (error) {
    botService.log('error', 'Database connection failed', { error: (error as Error).message });
    process.exit(1);
  }

  // AUTO-BOT DISABLED - Uncomment these lines to enable automatic updates
  // await safeUpdateCycle();
  // setInterval(safeUpdateCycle, CHECK_INTERVAL_MS);

  botService.log('success', 'Bot is running! Use diagnostic mode or enable auto-updates.');
}

async function gracefulShutdown(signal: string): Promise<void> {
  botService.log('warn', `Received ${signal}, shutting down bot gracefully...`);

  if (botService.status.running) {
    botService.log('info', `Waiting up to ${GRACEFUL_SHUTDOWN_WAIT_SECONDS}s for current cycle to finish...`);

    const deadline = Date.now() + GRACEFUL_SHUTDOWN_WAIT_SECONDS * 1000;
    while (botService.status.running && Date.now() < deadline) {
      await sleep(1000);
    }

    if (botService.status.running) {
      botService.log('warn', 'Forcing shutdown - cycle incomplete');
    }
  }

  // Close browser
  await NovelScraper.closeBrowser();

  // Close database
  try {
    await pool.end();
    botService.log('success', 'Database connection closed');
  } catch (error) {
    botService.log('error', 'Error closing database', { error: (error as Error).message });
  }

  botService.log('success', 'Bot shutdown complete');
  process.exit(0);
}

process.on('SIGTERM', () => void gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => void gracefulShutdown('SIGINT'));

export { updateNovelChapters, triggerManualUpdate, runSingleNovelOnly, safeUpdateCycle };

// Run directly
if (require.main === module) {
  startBot().catch(err => {
    console.error('Fatal bot error:', err);
    process.exit(1);
  });
}
