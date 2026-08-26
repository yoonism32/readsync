import {
  BATCH_INTERVAL_MS,
  BATCH_SIZE,
  CHECK_INTERVAL_MS,
  STALE_THRESHOLD_HOURS,
} from './config.js';
import pool from './db.js';
import { botService } from './services/BotService.js';
import { NovelScraper } from './services/NovelScraper.js';
import type { NovelRow, SingleRunResult } from './types/index.js';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/* ==================== Parsing Utilities ==================== */

export { parseNovelInfoFromHTML, parseTimeAgo } from './parseNovelInfo.js';

import { parseNovelInfoFromHTML } from './parseNovelInfo.js';

/* ==================== Database Operations ==================== */

export async function initNotifications(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id SERIAL PRIMARY KEY,
      user_id TEXT NOT NULL,
      novel_id TEXT NOT NULL,
      type TEXT NOT NULL,
      message TEXT NOT NULL,
      read BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
      FOREIGN KEY (novel_id) REFERENCES novels (id) ON DELETE CASCADE
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
    ON notifications (user_id, read, created_at DESC)
  `);
}

async function getNovelsNeedingUpdate(): Promise<NovelRow[]> {
  const staleHoursAgo = new Date(
    Date.now() - STALE_THRESHOLD_HOURS * 60 * 60 * 1000,
  ).toISOString();

  const result = await pool.query<NovelRow>(
    `
    SELECT DISTINCT n.id, n.primary_url, n.latest_chapter_num, n.chapters_updated_at,
           (SELECT MAX(updated_at) FROM progress_snapshots WHERE novel_id = n.id) as last_read_at,
           (SELECT COUNT(DISTINCT device_id) FROM progress_snapshots WHERE novel_id = n.id) as active_readers
    FROM novels n
    WHERE n.primary_url IS NOT NULL
      AND (n.chapters_updated_at IS NULL OR n.chapters_updated_at < $1)
    ORDER BY
      (SELECT COUNT(DISTINCT device_id) FROM progress_snapshots WHERE novel_id = n.id) DESC,
      n.chapters_updated_at ASC NULLS FIRST
  `,
    [staleHoursAgo],
  );

  return result.rows;
}

async function updateNovelChapterInfo(
  novelId: string,
  chapterNum: number,
  chapterTitle: string | null,
  genres: string | null,
  author: string | null,
  timeRaw: string | null,
  timeISO: string | null,
  synopsis: string | null,
): Promise<NovelRow> {
  const result = await pool.query<NovelRow>(
    `
    UPDATE novels
    SET latest_chapter_num = $2,
        latest_chapter_title = $3,
        chapters_updated_at = CURRENT_TIMESTAMP,
        genre = COALESCE($4, genre),
        author = COALESCE($5, author),
        site_latest_chapter_time_raw = $6,
        site_latest_chapter_time = $7,
        synopsis = COALESCE(synopsis, $8),
        synopsis_imported_at = CASE
          WHEN synopsis IS NULL AND $8 IS NOT NULL THEN CURRENT_TIMESTAMP
          ELSE synopsis_imported_at
        END
    WHERE id = $1
    RETURNING *
  `,
    [
      novelId,
      chapterNum,
      chapterTitle,
      genres,
      author,
      timeRaw,
      timeISO,
      synopsis,
    ],
  );

  return result.rows[0];
}

/* ==================== Single Novel Test Function ==================== */

let singleRunLock = false;

export async function runSingleNovelOnly(
  novelId: string,
): Promise<SingleRunResult> {
  if (singleRunLock) {
    return { error: 'Single-novel run already in progress' };
  }

  singleRunLock = true;
  console.log(`🧪 SINGLE-NOVEL MODE: Running ${novelId}`);

  try {
    const result = await pool.query<NovelRow>(
      'SELECT id, primary_url, latest_chapter_num FROM novels WHERE id = $1',
      [novelId],
    );

    if (result.rows.length === 0) return { error: 'Novel not found' };

    const novel = result.rows[0];
    if (!novel.primary_url) return { error: 'Novel has no URL' };

    const html = await NovelScraper.fetchNovelMainPage(novel.primary_url);
    const novelInfo = parseNovelInfoFromHTML(html, novel.primary_url);

    if (!novelInfo.chapter) return { error: 'Failed to parse chapter' };

    const updated = await updateNovelChapterInfo(
      novel.id,
      novelInfo.chapter.num,
      novelInfo.chapter.title,
      novelInfo.genres.join(', ') || null,
      novelInfo.author,
      novelInfo.site_latest_chapter_time_raw,
      novelInfo.site_latest_chapter_time,
      novelInfo.synopsis,
    );

    console.log(
      `SINGLE-NOVEL SUCCESS: ${novel.id} → Ch.${updated.latest_chapter_num}`,
    );

    return {
      success: true,
      previous: novel.latest_chapter_num,
      current: updated.latest_chapter_num ?? undefined,
      title: updated.latest_chapter_title ?? null,
    };
  } catch (err) {
    console.error('SINGLE-NOVEL FAILED:', (err as Error).message);
    return { error: (err as Error).message };
  } finally {
    singleRunLock = false;
  }
}

/* ==================== Bot Main Loop ==================== */

let isRunning = false;

export async function updateNovelChapters(): Promise<void> {
  if (isRunning) {
    botService.log('warn', 'Update cycle already in progress, skipping...');
    return;
  }

  isRunning = true;
  const cycleStartTime = Date.now();
  const cycleId = `cycle-${Date.now()}`;

  botService.log('info', 'Starting chapter update cycle', { cycleId });

  botService.patch({
    running: true,
    lastRun: new Date().toISOString(),
    cycleStartTime: new Date(cycleStartTime).toISOString(),
    novelsUpdated: 0,
    novelsChecked: 0,
    errors: [],
  });

  try {
    const novels = await getNovelsNeedingUpdate();

    if (novels.length === 0) {
      botService.log('success', 'All novels up to date!', { cycleId });
      botService.patch({
        lastRunSuccess: true,
        running: false,
        nextRun: new Date(Date.now() + CHECK_INTERVAL_MS).toISOString(),
      });
      return;
    }

    botService.log('info', `Found ${novels.length} novels needing updates`, {
      cycleId,
      count: novels.length,
    });

    // Process in batches
    for (let i = 0; i < novels.length; i += BATCH_SIZE) {
      const batch = novels.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(novels.length / BATCH_SIZE);

      botService.log('info', `Processing batch ${batchNum}/${totalBatches}`, {
        cycleId,
        batchSize: batch.length,
        progress: `${i + batch.length}/${novels.length}`,
      });

      for (const novel of batch) {
        botService.patch({
          novelsChecked: botService.status.novelsChecked + 1,
        });

        botService.log('info', 'Processing novel', {
          cycleId,
          novelId: novel.id,
          currentChapter: novel.latest_chapter_num ?? '?',
          activeReaders: novel.active_readers,
          lastCheck: novel.chapters_updated_at ?? 'Never',
          lastRead: novel.last_read_at ?? 'Never',
        });

        try {
          const html = await NovelScraper.fetchNovelMainPage(novel.primary_url);
          const novelInfo = parseNovelInfoFromHTML(html, novel.primary_url);

          if (!novelInfo.chapter) {
            botService.log('warn', 'Skipping novel (parse failed)', {
              cycleId,
              novelId: novel.id,
            });
            botService.addError({
              timestamp: new Date().toISOString(),
              level: 'warn',
              message: 'Parse failed',
              novel: novel.id,
              type: 'parse',
              cycleId,
            });
            continue;
          }

          botService.log('info', 'Successfully parsed novel', {
            cycleId,
            novelId: novel.id,
            chapter: novelInfo.chapter.num,
            title: novelInfo.chapter.title,
            genresCount: novelInfo.genres.length,
            hasAuthor: !!novelInfo.author,
            timeRaw: novelInfo.site_latest_chapter_time_raw,
          });

          if (
            novel.latest_chapter_num &&
            novelInfo.chapter.num <= novel.latest_chapter_num
          ) {
            botService.log(
              'info',
              `No new chapters (still at Ch.${novelInfo.chapter.num})`,
              {
                cycleId,
                novelId: novel.id,
              },
            );

            await pool.query(
              `
              UPDATE novels SET
                chapters_updated_at = CURRENT_TIMESTAMP,
                genre = COALESCE($2, genre),
                author = COALESCE($3, author),
                site_latest_chapter_time_raw = $4,
                site_latest_chapter_time = $5,
                synopsis = COALESCE(synopsis, $6),
                synopsis_imported_at = CASE
                  WHEN synopsis IS NULL AND $6 IS NOT NULL THEN CURRENT_TIMESTAMP
                  ELSE synopsis_imported_at
                END
              WHERE id = $1
            `,
              [
                novel.id,
                novelInfo.genres.join(', ') || null,
                novelInfo.author,
                novelInfo.site_latest_chapter_time_raw,
                novelInfo.site_latest_chapter_time,
                novelInfo.synopsis,
              ],
            );
          } else {
            const updated = await updateNovelChapterInfo(
              novel.id,
              novelInfo.chapter.num,
              novelInfo.chapter.title,
              novelInfo.genres.join(', ') || null,
              novelInfo.author,
              novelInfo.site_latest_chapter_time_raw,
              novelInfo.site_latest_chapter_time,
              novelInfo.synopsis,
            );

            botService.log('success', 'Updated novel', {
              cycleId,
              novelId: novel.id,
              previousChapter: novel.latest_chapter_num ?? '?',
              newChapter: updated.latest_chapter_num,
              title: updated.latest_chapter_title,
              genres:
                novelInfo.genres.length > 0
                  ? novelInfo.genres.join(', ')
                  : null,
            });

            botService.patch({
              novelsUpdated: botService.status.novelsUpdated + 1,
            });
          }
        } catch (error) {
          botService.log('error', 'Novel processing failed', {
            cycleId,
            novelId: novel.id,
            error: (error as Error).message,
          });
          botService.addError({
            timestamp: new Date().toISOString(),
            level: 'error',
            message: (error as Error).message,
            novel: novel.id,
            type: 'fetch',
            cycleId,
          });
        }
      }

      // Wait between batches (except for the last batch)
      if (i + BATCH_SIZE < novels.length) {
        const waitMinutes = BATCH_INTERVAL_MS / 60_000;
        botService.log(
          'info',
          `Waiting ${waitMinutes} minutes before next batch...`,
          { cycleId },
        );
        await sleep(BATCH_INTERVAL_MS);
      }
    }

    const cycleDuration = Date.now() - cycleStartTime;
    botService.patch({
      cycleDuration: `${Math.floor(cycleDuration / 1000)}s`,
      lastRunSuccess: true,
      nextRun: new Date(Date.now() + CHECK_INTERVAL_MS).toISOString(),
    });

    botService.log('success', 'Update cycle completed', {
      cycleId,
      duration: botService.status.cycleDuration,
      checked: botService.status.novelsChecked,
      updated: botService.status.novelsUpdated,
    });

    // Close browser after cycle completes to save memory
    await NovelScraper.closeBrowser();
  } catch (error) {
    botService.log('error', 'Update cycle failed', {
      error: (error as Error).message,
      stack: (error as Error).stack,
    });
    botService.patch({ lastRunSuccess: false });
    botService.addError({
      timestamp: new Date().toISOString(),
      level: 'error',
      message: (error as Error).message,
      stack: (error as Error).stack,
      type: 'fatal',
    });
  } finally {
    isRunning = false;
    botService.patch({ running: false });
  }
}

export async function triggerManualUpdate(
  _novelId?: string,
): Promise<{ triggered: boolean }> {
  botService.log('info', 'Manual update triggered');
  setImmediate(() => void updateNovelChapters());
  return { triggered: true };
}

export async function safeUpdateCycle(): Promise<void> {
  try {
    await updateNovelChapters();
  } catch (error) {
    botService.log('error', 'Critical error in update cycle', {
      error: (error as Error).message,
      stack: (error as Error).stack,
    });
    botService.patch({ lastRunSuccess: false });
    botService.addError({
      timestamp: new Date().toISOString(),
      level: 'error',
      message: (error as Error).message,
      stack: (error as Error).stack,
      type: 'fatal',
    });
  }
}
