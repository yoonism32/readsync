import { Router } from 'express';
import type { Server as SocketServer } from 'socket.io';
import {
  DECIMAL_RADIX,
  DEFAULT_ANALYTICS_HOURS,
  HTTP_BAD_REQUEST,
  HTTP_NOT_FOUND,
  MAX_ANALYTICS_HOURS,
  MIN_ANALYTICS_HOURS,
} from '../config.js';
import pool from '../db/pool.js';
import logger from '../logger.js';
import { requireAuthAPI, validateApiKey } from '../middleware/auth.js';
import { handleDbError } from '../middleware/errorHandler.js';
import {
  isChapterRegression,
  recordCorrectionAttempt,
} from '../services/ChapterCorrection.js';
import { parseTimeAgo } from '../services/NovelService.js';
import { isReaderCoverUrl } from '../services/ReaderUrl.js';
import type { AuthenticatedRequest } from '../types/index.js';

// Bot (bot/src/) sunset 2026-09-08: it never ran in production (setBotModule
// was never called from src/), so every botModule-gated route below always
// 503'd there. Removed rather than left as dead plumbing. What remains here
// is genuinely admin-facing (stale-novels report) or userscript-facing
// (auto-update), neither of which ever depended on the bot.

export function createAdminRouter(io: SocketServer): Router {
  const router = Router();

  router.get('/api/v1/admin/novels/stale', requireAuthAPI, async (req, res) => {
    const { hours = String(DEFAULT_ANALYTICS_HOURS) } = req.query as Record<
      string,
      string
    >;
    const hoursValue = Math.max(
      MIN_ANALYTICS_HOURS,
      Math.min(
        MAX_ANALYTICS_HOURS,
        parseInt(hours, DECIMAL_RADIX) || DEFAULT_ANALYTICS_HOURS,
      ),
    );

    try {
      const result = await pool.query(
        `
      SELECT
        n.id, n.title, n.primary_url,
        n.latest_chapter_num, n.latest_chapter_title, n.chapters_updated_at,
        COUNT(DISTINCT p.user_id) AS active_readers,
        MAX(p.created_at) AS last_read_at
      FROM novels n
      LEFT JOIN progress_snapshots p ON p.novel_id = n.id
      WHERE
        n.primary_url IS NOT NULL
        AND (
          n.chapters_updated_at IS NULL
          OR n.chapters_updated_at < NOW() - make_interval(hours => $1)
        )
      GROUP BY n.id, n.title, n.primary_url, n.latest_chapter_num, n.latest_chapter_title, n.chapters_updated_at
      HAVING COUNT(DISTINCT p.user_id) > 0
      ORDER BY active_readers DESC, n.chapters_updated_at ASC NULLS FIRST
    `,
        [hoursValue],
      );

      res.json(result.rows);
    } catch (error) {
      handleDbError(res, error, 'Get stale novels');
    }
  });

  // Auto-update endpoint called by Tampermonkey userscript.
  // Auth via validateApiKey (per-user key in the users table), same as the
  // progress/compare routes the userscript already uses — not the unrelated
  // API_KEY env var, which isn't set in production.
  router.post(
    '/api/v1/admin/novels/auto-update',
    validateApiKey,
    async (req, res) => {
      const {
        novel_id,
        chapter_num,
        chapter_title,
        chapter_verified,
        genres,
        author,
        update_time_raw,
        cover_url,
        synopsis,
      } = req.body as Record<string, unknown>;

      // og:image from the novel page. Only trust cover CDN hosts — the server
      // can't fetch these itself (Cloudflare bot-filters datacenter IPs), so the
      // URL is stored as-is for the browser to load directly.
      const safeCoverUrl = isReaderCoverUrl(cover_url) ? cover_url : null;

      if (
        typeof novel_id !== 'string' ||
        novel_id.length === 0 ||
        novel_id.length > 200 ||
        !Number.isInteger(chapter_num) ||
        Number(chapter_num) < 1 ||
        Number(chapter_num) > 100000 ||
        [chapter_title, author, update_time_raw].some(
          (value) =>
            value != null && (typeof value !== 'string' || value.length > 1000),
        ) ||
        (synopsis != null &&
          (typeof synopsis !== 'string' || synopsis.length > 20000)) ||
        (chapter_verified != null && typeof chapter_verified !== 'boolean') ||
        (genres != null && (typeof genres !== 'string' || genres.length > 5000))
      ) {
        return res.status(HTTP_BAD_REQUEST).json({
          error: 'Missing required fields',
          required: ['novel_id', 'chapter_num'],
        });
      }

      try {
        const checkResult = await pool.query<{
          id: string;
          latest_chapter_num: number | null;
        }>(
          `SELECT n.id, n.latest_chapter_num FROM novels n
          WHERE n.id = $1 AND EXISTS (SELECT 1 FROM user_novel_meta m WHERE m.novel_id = n.id AND m.user_id = $2)`,
          [novel_id, (req as AuthenticatedRequest).user.id],
        );

        if (checkResult.rows.length === 0) {
          return res
            .status(HTTP_NOT_FOUND)
            .json({ error: 'Novel not in your list', novel_id });
        }

        const currentChapter = checkResult.rows[0].latest_chapter_num;
        const scrapedNum = Number(chapter_num);
        // NovelBin sent "2 hours ago" strings; NovelArrow sends ISO timestamps
        let parsed = parseTimeAgo(update_time_raw as string);
        if (!parsed && update_time_raw) {
          const isoDate = new Date(update_time_raw as string);
          if (!Number.isNaN(isoDate.getTime())) parsed = isoDate;
        }
        const site_latest_chapter_time = parsed ? parsed.toISOString() : null;

        const isRegression = isChapterRegression(scrapedNum, currentChapter);
        const isConfirmedCorrection = recordCorrectionAttempt(
          novel_id as string,
          scrapedNum,
          currentChapter,
          chapter_verified === true,
        );

        // Chapter number, title, and site-update-time only ever advance
        // together, unless $9 (a confirmed correction — see
        // ../services/ChapterCorrection.ts) says a lower count has now been
        // scraped twice in a row and should be trusted over the stale one.
        // Genre/author/cover are independent facts and stay on COALESCE
        // regardless.
        const result = await pool.query(
          `
      UPDATE novels
      SET latest_chapter_num = CASE WHEN $2::int >= COALESCE(latest_chapter_num, 0) OR $9::boolean THEN $2::int ELSE latest_chapter_num END,
          latest_chapter_title = CASE WHEN $2::int >= COALESCE(latest_chapter_num, 0) OR $9::boolean THEN $3 ELSE latest_chapter_title END,
          chapters_updated_at = CURRENT_TIMESTAMP,
          genre = COALESCE($4, genre),
          author = COALESCE($5, author),
          site_latest_chapter_time_raw = CASE WHEN $2::int >= COALESCE(latest_chapter_num, 0) OR $9::boolean THEN $6 ELSE site_latest_chapter_time_raw END,
          site_latest_chapter_time = CASE WHEN $2::int >= COALESCE(latest_chapter_num, 0) OR $9::boolean THEN $7 ELSE site_latest_chapter_time END,
          cover_img = CASE
            WHEN $8::text IS NOT NULL AND (cover_img IS NULL OR cover_img = 'failed')
            THEN $8::text ELSE cover_img
          END,
          synopsis = COALESCE(synopsis, $10),
          synopsis_imported_at = CASE
            WHEN synopsis IS NULL AND $10::text IS NOT NULL THEN CURRENT_TIMESTAMP
            ELSE synopsis_imported_at
          END
      WHERE id = $1
      RETURNING *
    `,
          [
            novel_id,
            chapter_num,
            chapter_title || null,
            genres || null,
            author || null,
            update_time_raw || null,
            site_latest_chapter_time,
            safeCoverUrl,
            isConfirmedCorrection,
            typeof synopsis === 'string' && synopsis.length > 0
              ? synopsis
              : null,
          ],
        );

        const updated = result.rows[0] as {
          id: string;
          title: string;
          latest_chapter_num: number;
        };

        const rejectedRegression = isRegression && !isConfirmedCorrection;

        logger.info(
          {
            novel_id,
            current_chapter: updated.latest_chapter_num,
            previous_chapter: currentChapter,
            scraped_chapter: scrapedNum,
            rejected_regression: rejectedRegression,
            confirmed_correction: isConfirmedCorrection,
            // TEMP DIAGNOSTIC for the 2026-09-12 OOM crash loop — remove
            // once the cause is confirmed. Every crash so far shows a burst
            // of these calls right before dying; this shows whether rss
            // climbs call-over-call within that burst.
            rssMB: Math.round(process.memoryUsage().rss / 1024 / 1024),
          },
          isConfirmedCorrection
            ? 'Auto-update received — chapter count corrected downward (confirmed twice)'
            : rejectedRegression
              ? 'Auto-update received — backwards chapter count rejected'
              : 'Auto-update received',
        );

        // New chapters found by the Update All flow — feed the bell. Fires only
        // on an actual increase, so repeat refreshes don't duplicate.
        if (
          currentChapter !== null &&
          updated.latest_chapter_num > currentChapter
        ) {
          const newCount = updated.latest_chapter_num - currentChapter;
          await pool.query(
            `INSERT INTO notifications (user_id, novel_id, type, message)
         VALUES ($1, $2, 'new_chapters', $3)`,
            [
              (req as unknown as AuthenticatedRequest).user.id,
              updated.id,
              `${updated.title}: ${newCount} new chapter${newCount === 1 ? '' : 's'} (${currentChapter} → ${updated.latest_chapter_num})`,
            ],
          );

          try {
            io.to(
              `user:${(req as unknown as AuthenticatedRequest).user.id}`,
            ).emit('chapters:updated', {
              novel_id: updated.id,
              title: updated.title,
              previous_chapter: currentChapter,
              latest_chapter: updated.latest_chapter_num,
              timestamp: new Date().toISOString(),
            });
          } catch (wsErr) {
            logger.error({ wsErr }, 'WebSocket emit error (non-fatal)');
          }
        }

        res.json({
          success: true,
          novel_id: updated.id,
          previous_chapter: currentChapter,
          current_chapter: updated.latest_chapter_num,
          is_new_chapter:
            currentChapter !== null &&
            updated.latest_chapter_num > currentChapter,
          rejected_regression: rejectedRegression,
          site_update_time: site_latest_chapter_time,
          updated_fields: {
            chapter: !!chapter_title,
            genres: !!genres,
            author: !!author,
            time: !!update_time_raw,
          },
        });
      } catch (error) {
        handleDbError(res, error, 'Auto-update');
      }
    },
  );

  return router;
}
