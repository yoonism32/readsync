import { Router } from 'express';
import { body } from 'express-validator';
import type { Server as SocketServer } from 'socket.io';
import {
  AUTO_REREAD_CHAPTER_THRESHOLD,
  CHAPTER_RESTART_THRESHOLD_PERCENT,
  HTTP_BAD_REQUEST,
  HTTP_NOT_FOUND,
  MAX_DEVICE_ID_LENGTH,
  MAX_DEVICE_LABEL_LENGTH,
  MAX_PERCENT,
  MIN_PERCENT,
  SIGNIFICANT_PROGRESS_THRESHOLD_PERCENT,
} from '../config.js';
import pool, { withTransaction } from '../db/pool.js';
import logger from '../logger.js';
import { validateApiKey } from '../middleware/auth.js';
import { handleDbError } from '../middleware/errorHandler.js';
import { handleValidationErrors } from '../middleware/validation.js';
import {
  deriveNovelMainUrl,
  detectDeviceType,
  extractNovelTitle,
  getLatestStates,
  normalizeNovelId,
  parseChapterFromUrl,
} from '../services/NovelService.js';
import type { AuthenticatedRequest } from '../types/index.js';

export function createProgressRouter(io: SocketServer): Router {
  const router = Router();

  // POST /api/v1/progress
  router.post(
    '/api/v1/progress',
    [
      body('device_id')
        .isString()
        .isLength({ min: 1, max: MAX_DEVICE_ID_LENGTH }),
      body('device_label')
        .isString()
        .isLength({ min: 1, max: MAX_DEVICE_LABEL_LENGTH }),
      body('novel_url').isURL(),
      body('percent').isFloat({ min: MIN_PERCENT, max: MAX_PERCENT }),
      body('seconds_on_page').optional().isInt({ min: 0 }),
      handleValidationErrors,
    ],
    validateApiKey,
    async (req: import('express').Request, res: import('express').Response) => {
      const {
        device_id,
        device_label,
        novel_url,
        percent,
        seconds_on_page = 0,
      } = req.body as Record<string, unknown>;
      const user_id = (req as AuthenticatedRequest).user.id;

      const novel_id = normalizeNovelId(novel_url as string);
      const novel_title = extractNovelTitle(novel_url as string);
      const baseNovelUrl = deriveNovelMainUrl(novel_url as string);

      const chapterInfo = (req.body as Record<string, unknown>)
        .current_chapter_num
        ? {
            token: 'chapter',
            num: Number(
              (req.body as Record<string, unknown>).current_chapter_num,
            ),
          }
        : parseChapterFromUrl(novel_url as string);

      logger.debug(
        {
          current_chapter_num: (req.body as Record<string, unknown>)
            .current_chapter_num,
          current_chapter_source: (req.body as Record<string, unknown>)
            .current_chapter_source,
          url_parsed: parseChapterFromUrl(novel_url as string),
          final_chapter: chapterInfo?.num,
        },
        'Chapter detection',
      );

      if (!novel_id || !chapterInfo) {
        return res
          .status(HTTP_BAD_REQUEST)
          .json({ error: 'Invalid novel URL format or missing chapter info' });
      }

      const percentValue = Math.max(
        MIN_PERCENT,
        Math.min(MAX_PERCENT, Number(percent)),
      );
      const latestChapterNum =
        (req.body as Record<string, unknown>).latest_chapter_num != null
          ? Number((req.body as Record<string, unknown>).latest_chapter_num)
          : null;
      const latestChapterTitle =
        ((req.body as Record<string, unknown>)
          .latest_chapter_title as string) || null;

      try {
        const result = await withTransaction(async (client) => {
          const existingNovel = await client.query(
            'SELECT novel_id FROM user_novel_meta WHERE user_id = $1 AND novel_id = $2',
            [user_id, novel_id],
          );
          const novelExistsInList = existingNovel.rows.length > 0;

          if (!novelExistsInList) {
            const hasProgress = percentValue > 0 || Number(seconds_on_page) > 5;
            if (!hasProgress) {
              logger.debug(
                { novel_id },
                'Novel not in list and no progress — skipping',
              );
              res.status(HTTP_NOT_FOUND).json({
                error: 'Novel not in reading list',
                message:
                  'Start reading a chapter to add this novel to your list',
              });
              return null;
            }
            logger.info({ novel_id }, 'Creating new novel entry (first read)');
          }

          const deviceType = detectDeviceType(req.get('User-Agent'));

          await client.query(
            `
            INSERT INTO devices (id, user_id, device_label, device_type, user_agent, last_seen, active)
            VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, TRUE)
            ON CONFLICT (id) DO UPDATE SET
              device_label = EXCLUDED.device_label,
              device_type = EXCLUDED.device_type,
              user_agent = EXCLUDED.user_agent,
              last_seen = CURRENT_TIMESTAMP,
              active = TRUE
          `,
            [
              device_id,
              user_id,
              device_label,
              deviceType,
              req.get('User-Agent') ?? '',
            ],
          );

          if (!novelExistsInList) {
            await client.query(
              `
              INSERT INTO novels (id, title, primary_url, latest_chapter_num, latest_chapter_title, chapters_updated_at)
              VALUES ($1, $2, $3, $4::integer, $5, CASE WHEN $4::integer IS NOT NULL THEN CURRENT_TIMESTAMP ELSE NULL END)
            `,
              [
                novel_id,
                novel_title,
                baseNovelUrl,
                latestChapterNum,
                latestChapterTitle,
              ],
            );
          } else {
            await client.query(
              `
              UPDATE novels SET
                title = $2,
                primary_url = COALESCE(primary_url, $3),
                latest_chapter_num = GREATEST(COALESCE(latest_chapter_num, 0), COALESCE($4::integer, 0)),
                latest_chapter_title = CASE WHEN $4::integer > COALESCE(latest_chapter_num, 0) THEN $5 ELSE latest_chapter_title END,
                chapters_updated_at = CASE WHEN $4::integer > COALESCE(latest_chapter_num, 0) THEN CURRENT_TIMESTAMP ELSE chapters_updated_at END
              WHERE id = $1
            `,
              [
                novel_id,
                novel_title,
                baseNovelUrl,
                latestChapterNum,
                latestChapterTitle,
              ],
            );
          }

          await client.query(
            `
            INSERT INTO user_novel_meta (user_id, novel_id, started_at)
            VALUES ($1, $2, CURRENT_TIMESTAMP)
            ON CONFLICT (user_id, novel_id) DO NOTHING
          `,
            [user_id, novel_id],
          );

          const metaResult = await client.query<{
            current_read_through: number;
            started_at: Date;
            completed_at: Date | null;
            status: string;
          }>(
            'SELECT current_read_through, started_at, completed_at, status FROM user_novel_meta WHERE user_id = $1 AND novel_id = $2',
            [user_id, novel_id],
          );
          let currentReadThrough =
            metaResult.rows.length > 0
              ? metaResult.rows[0].current_read_through
              : 1;

          // Auto-detect reread
          const maxChapterResult = await client.query<{
            max_chapter: number;
            max_percent: string;
          }>(
            'SELECT MAX(chapter_num) as max_chapter, MAX(percent) as max_percent FROM progress_snapshots WHERE user_id = $1 AND novel_id = $2 AND read_through_num = $3',
            [user_id, novel_id, currentReadThrough],
          );
          const maxChapter = maxChapterResult.rows[0]?.max_chapter ?? 0;

          if (maxChapter - chapterInfo.num >= AUTO_REREAD_CHAPTER_THRESHOLD) {
            const meta = metaResult.rows[0];
            const archiveEntry = {
              read_through: currentReadThrough,
              started_at: meta.started_at,
              completed_at: meta.completed_at ?? new Date().toISOString(),
              max_chapter: maxChapter,
              max_percent: parseFloat(
                maxChapterResult.rows[0]?.max_percent ?? '0',
              ),
            };

            await client.query(
              `
              UPDATE user_novel_meta
              SET read_history = CASE
                WHEN NOT EXISTS (
                  SELECT 1 FROM jsonb_array_elements(COALESCE(read_history, '[]'::jsonb)) elem
                  WHERE (elem->>'read_through')::int = $3
                )
                THEN COALESCE(read_history, '[]'::jsonb) || $4::jsonb
                ELSE read_history
              END
              WHERE user_id = $1 AND novel_id = $2
            `,
              [
                user_id,
                novel_id,
                currentReadThrough,
                JSON.stringify(archiveEntry),
              ],
            );

            const newRT = currentReadThrough + 1;
            await client.query(
              `
              UPDATE user_novel_meta SET
                current_read_through = $3, started_at = CURRENT_TIMESTAMP,
                completed_at = NULL, status = 'reading', updated_at = CURRENT_TIMESTAMP
              WHERE user_id = $1 AND novel_id = $2
            `,
              [user_id, novel_id, newRT],
            );

            logger.info(
              {
                novel_id,
                oldRT: currentReadThrough,
                newRT,
                maxChapter,
                currentChapter: chapterInfo.num,
              },
              'Auto-detected reread',
            );
            currentReadThrough = newRT;
          }

          // Max-progress policy
          const lastProgress = await client.query<{
            percent: string;
            chapter_num: number;
          }>(
            'SELECT percent, chapter_num FROM progress_snapshots WHERE user_id = $1 AND device_id = $2 AND novel_id = $3 AND read_through_num = $4 ORDER BY created_at DESC LIMIT 1',
            [user_id, device_id, novel_id, currentReadThrough],
          );

          let shouldUpdate = true;
          if (lastProgress.rows.length > 0) {
            const prev = lastProgress.rows[0];
            if (
              prev.chapter_num === chapterInfo.num &&
              percentValue <= parseFloat(prev.percent)
            )
              shouldUpdate = false;
            if (chapterInfo.num < prev.chapter_num) shouldUpdate = false;
            if (
              percentValue <= CHAPTER_RESTART_THRESHOLD_PERCENT &&
              parseFloat(prev.percent) >
                SIGNIFICANT_PROGRESS_THRESHOLD_PERCENT &&
              prev.chapter_num === chapterInfo.num
            )
              shouldUpdate = false;
          }

          if (shouldUpdate) {
            await client.query(
              'INSERT INTO progress_snapshots (user_id, device_id, novel_id, chapter_token, chapter_num, percent, url, seconds_on_page, read_through_num) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
              [
                user_id,
                device_id,
                novel_id,
                chapterInfo.token,
                chapterInfo.num,
                percentValue,
                novel_url,
                seconds_on_page,
                currentReadThrough,
              ],
            );
          }

          return getLatestStates(client, user_id, novel_id, currentReadThrough);
        });

        if (!result) return; // early-exit (no progress)

        const response = {
          status: 'success',
          updated: true,
          novel_id,
          ...result,
        };

        try {
          io.to(`user:${user_id}`).emit('progress:updated', {
            novel_id,
            ...result,
            timestamp: new Date().toISOString(),
          });
        } catch (wsErr) {
          logger.error({ wsErr }, 'WebSocket emit error (non-fatal)');
        }

        res.json(response);
      } catch (error) {
        handleDbError(res, error, 'Progress update');
      }
    },
  );

  // GET /api/v1/progress
  router.get('/api/v1/progress', validateApiKey, async (req, res) => {
    const { novel_id } = req.query as { novel_id?: string };
    if (!novel_id)
      return res
        .status(HTTP_BAD_REQUEST)
        .json({ error: 'novel_id parameter required' });

    try {
      const client = await pool.connect();
      try {
        const states = await getLatestStates(
          client,
          (req as AuthenticatedRequest).user.id,
          novel_id,
        );
        res.json(states);
      } finally {
        client.release();
      }
    } catch (error) {
      handleDbError(res, error, 'Get progress');
    }
  });

  // GET /api/v1/compare
  router.get('/api/v1/compare', validateApiKey, async (req, res) => {
    const { novel_id, device_id } = req.query as {
      novel_id?: string;
      device_id?: string;
    };
    if (!novel_id || !device_id) {
      return res
        .status(HTTP_BAD_REQUEST)
        .json({ error: 'novel_id and device_id parameters required' });
    }

    try {
      const client = await pool.connect();
      try {
        const states = await getLatestStates(
          client,
          (req as AuthenticatedRequest).user.id,
          novel_id,
        );
        const deviceState = states.latest_per_device[device_id];
        const globalState = states.latest_global;

        if (!deviceState || !globalState) {
          return res.json({
            device_state: deviceState ?? null,
            global_state: globalState ?? null,
            should_prompt_jump: false,
          });
        }

        const chapterDiff =
          (globalState.chapter_num ?? 0) - (deviceState.chapter_num ?? 0);
        const percentDiff = globalState.percent - deviceState.percent;
        let shouldPrompt =
          chapterDiff > 0 || (chapterDiff === 0 && percentDiff >= 5.0);
        if (globalState.device_id === device_id) shouldPrompt = false;

        res.json({
          device_state: deviceState,
          global_state: globalState,
          delta: { chapters_ahead: chapterDiff, percent_diff: percentDiff },
          should_prompt_jump: shouldPrompt,
        });
      } finally {
        client.release();
      }
    } catch (error) {
      handleDbError(res, error, 'Compare progress');
    }
  });

  // GET /api/v1/debug/last
  router.get('/api/v1/debug/last', validateApiKey, async (req, res) => {
    try {
      const result = await pool.query(
        'SELECT p.*, d.device_label, n.title FROM progress_snapshots p JOIN devices d ON d.id = p.device_id JOIN novels n ON n.id = p.novel_id WHERE p.user_id = $1 ORDER BY p.created_at DESC LIMIT 1',
        [(req as AuthenticatedRequest).user.id],
      );
      res.json({
        last_snapshot: result.rows[0] ?? null,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      handleDbError(res, error, 'Get last progress');
    }
  });

  return router;
}
