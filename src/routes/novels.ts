import type { Request, Response } from 'express';
import { Router } from 'express';
import { body, param } from 'express-validator';
import {
  DEVICE_BEHIND_THRESHOLD_PERCENT,
  MAX_NOVEL_ID_LENGTH,
} from '../config.js';
import pool, { withTransaction } from '../db/pool.js';
import { requireAuthAPI, validateApiKey } from '../middleware/auth.js';
import { handleDbError } from '../middleware/errorHandler.js';
import {
  handleValidationErrors,
  validateNovelId,
  validatePagination,
} from '../middleware/validation.js';
import { buildExport } from '../services/ExportService.js';
import { getLatestStates, healDeadSiteUrl } from '../services/NovelService.js';
import type { AuthenticatedRequest, NovelStatus } from '../types/index.js';

const router = Router();

// GET /api/v1/novels
router.get(
  '/api/v1/novels',
  requireAuthAPI,
  validateApiKey,
  validatePagination,
  async (req: Request, res: Response) => {
    const { include_removed, status, favorite } = req.query as Record<
      string,
      string | undefined
    >;
    const { limit, offset } = (req as AuthenticatedRequest).pagination;
    const userId = (req as AuthenticatedRequest).user.id;

    try {
      const client = await pool.connect();
      try {
        const params: unknown[] = [userId];
        let paramIndex = 1;
        const whereConditions: string[] = [];

        if (include_removed !== 'true')
          whereConditions.push(`COALESCE(m.status, 'reading') <> 'removed'`);
        if (status) {
          whereConditions.push(
            `COALESCE(m.status, 'reading') = $${++paramIndex}`,
          );
          params.push(status);
        }
        if (favorite === 'true') whereConditions.push(`m.favorite = TRUE`);

        const whereClause = whereConditions.length
          ? `AND ${whereConditions.join(' AND ')}`
          : '';

        const novelsQuery = `
        WITH latest_activity AS (
          SELECT DISTINCT ON (novel_id) novel_id, created_at as last_activity
          FROM progress_snapshots WHERE user_id = $1
          ORDER BY novel_id, created_at DESC
        )
        SELECT
          n.id, n.title, n.primary_url, n.author, n.genre,
          n.latest_chapter_num, n.latest_chapter_title, n.chapters_updated_at,
          n.site_latest_chapter_time_raw, n.site_latest_chapter_time,
          la.last_activity,
          COALESCE(m.status, 'reading') AS status,
          COALESCE(m.favorite, FALSE) AS favorite,
          COALESCE(m.rating, 0) AS rating,
          m.notes, m.started_at, m.completed_at,
          COALESCE(m.current_read_through, 1) AS current_read_through,
          COALESCE(m.read_history, '[]'::jsonb) AS read_history,
          m.created_at,
          -- Not filtered on d.active: see getLatestStates() in NovelService.
          -- The latest_activity CTE above never was, so gating these two made
          -- a removed device show a live "last read" date next to ch. 0.
          (SELECT row_to_json(g) FROM (
            SELECT p.chapter_num, p.chapter_token, p.percent, p.device_id, d.device_label, p.url, p.created_at as ts
            FROM progress_snapshots p JOIN devices d ON p.device_id = d.id
            WHERE p.user_id = $1 AND p.novel_id = n.id
              AND p.read_through_num = COALESCE(m.current_read_through, 1)
            ORDER BY p.chapter_num DESC, p.percent DESC, p.created_at DESC LIMIT 1
          ) g) as latest_global_json,
          -- LATERAL per device instead of DISTINCT ON over the whole
          -- read-through: idx_progress_device_novel_latest turns each
          -- device's lookup into an Index Scan + LIMIT 1 instead of a scan
          -- of every snapshot in the group. See migration 010.
          (SELECT json_object_agg(device_id, device_state) FROM (
            SELECT d.id AS device_id,
              json_build_object('chapter_num', p.chapter_num, 'chapter_token', p.chapter_token,
                'percent', p.percent, 'device_label', d.device_label, 'url', p.url, 'ts', p.created_at) as device_state
            FROM devices d
            CROSS JOIN LATERAL (
              SELECT chapter_num, chapter_token, percent, url, created_at
              FROM progress_snapshots
              WHERE device_id = d.id AND user_id = $1 AND novel_id = n.id
                AND read_through_num = COALESCE(m.current_read_through, 1)
              ORDER BY created_at DESC LIMIT 1
            ) p
            WHERE d.user_id = $1
          ) pd) as latest_per_device_json
        FROM novels n
        JOIN latest_activity la ON n.id = la.novel_id
        LEFT JOIN user_novel_meta m ON m.user_id = $1 AND m.novel_id = n.id
        WHERE 1=1 ${whereClause}
        ORDER BY la.last_activity DESC
        LIMIT $${++paramIndex} OFFSET $${++paramIndex}
      `;

        params.push(limit, offset);
        const novelsResult = await client.query(novelsQuery, params);

        const results = novelsResult.rows.map((novel) => {
          const latest_global = novel.latest_global_json ?? null;
          if (latest_global) {
            latest_global.url = healDeadSiteUrl(latest_global.url, novel.id);
          }
          let latest_per_device: Record<string, unknown> =
            novel.latest_per_device_json ?? {};
          for (const d of Object.values(
            latest_per_device as Record<string, { url?: string | null }>,
          )) {
            d.url = healDeadSiteUrl(d.url, novel.id);
          }

          if (latest_global && Object.keys(latest_per_device).length > 0) {
            const cleaned: Record<string, unknown> = {};
            const gc = Number(latest_global.chapter_num) || 0;
            const gp = Number(latest_global.percent) || 0;
            const lid = latest_global.device_id;
            for (const [id, d] of Object.entries(
              latest_per_device as Record<
                string,
                { chapter_num?: number; percent?: number }
              >,
            )) {
              if (id === lid) {
                cleaned[id] = d;
                continue;
              }
              const dc = Number(d.chapter_num) || 0;
              const dp = Number(d.percent) || 0;
              if (dc < gc) continue;
              if (dc === gc && dp < gp - DEVICE_BEHIND_THRESHOLD_PERCENT)
                continue;
              cleaned[id] = d;
            }
            latest_per_device = cleaned;
          }

          return {
            novel_id: novel.id,
            title: novel.title,
            primary_url: novel.primary_url,
            author: novel.author,
            genre: novel.genre,
            latest_chapter_num: novel.latest_chapter_num,
            latest_chapter_title: novel.latest_chapter_title,
            chapters_updated_at: novel.chapters_updated_at,
            site_latest_chapter_time_raw: novel.site_latest_chapter_time_raw,
            site_latest_chapter_time: novel.site_latest_chapter_time,
            status: novel.status,
            favorite: novel.favorite,
            rating: novel.rating,
            notes: novel.notes,
            started_at: novel.started_at,
            completed_at: novel.completed_at,
            last_activity: novel.last_activity,
            current_read_through: novel.current_read_through,
            read_history: novel.read_history,
            created_at: novel.created_at,
            latest_global,
            latest_per_device,
          };
        });

        res.json(results);
      } finally {
        client.release();
      }
    } catch (error) {
      handleDbError(res, error, 'List novels');
    }
  },
);

// GET /api/v1/novels/:novelId/chapters-read
// Distinct chapters visited in the current read-through — powers the
// dashboard chapter map (read/unread/current markers).
router.get(
  '/api/v1/novels/:novelId/chapters-read',
  validateApiKey,
  validateNovelId,
  async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthenticatedRequest).user.id;
      const novelId = req.params.novelId;

      const meta = await pool.query<{ rt: number }>(
        `SELECT COALESCE(current_read_through, 1) AS rt
         FROM user_novel_meta WHERE user_id = $1 AND novel_id = $2`,
        [userId, novelId],
      );
      const readThrough = meta.rows[0]?.rt ?? 1;

      const result = await pool.query<{ chapter_num: number }>(
        `SELECT DISTINCT chapter_num FROM progress_snapshots
         WHERE user_id = $1 AND novel_id = $2 AND read_through_num = $3
         ORDER BY chapter_num`,
        [userId, novelId, readThrough],
      );

      res.json({
        read_through: readThrough,
        chapters: result.rows.map((r) => r.chapter_num),
      });
    } catch (error) {
      handleDbError(res, error, 'Get chapters read');
    }
  },
);

// PUT /api/v1/novels/:novelId/status
router.put(
  '/api/v1/novels/:novelId/status',
  requireAuthAPI,
  [
    param('novelId').isString().isLength({ min: 1, max: MAX_NOVEL_ID_LENGTH }),
    body('status').isIn([
      'reading',
      'completed',
      'on-hold',
      'dropped',
      'plan-to-read',
      'removed',
    ]),
    handleValidationErrors,
  ],
  validateApiKey,
  validateNovelId,
  async (req: Request, res: Response) => {
    const { novelId } = req.params;
    const { status } = req.body as { status: NovelStatus };
    const userId = (req as AuthenticatedRequest).user.id;

    try {
      const result = await withTransaction(async (client) => {
        await client.query(
          `INSERT INTO user_novel_meta (user_id, novel_id, status, updated_at) VALUES ($1, $2, 'reading', CURRENT_TIMESTAMP) ON CONFLICT (user_id, novel_id) DO NOTHING`,
          [userId, novelId],
        );

        const updateResult = await client.query(
          `UPDATE user_novel_meta SET status = $3, updated_at = CURRENT_TIMESTAMP,
            completed_at = CASE WHEN $3 = 'completed' THEN COALESCE(completed_at, CURRENT_TIMESTAMP) WHEN $3 != 'completed' THEN NULL ELSE completed_at END
          WHERE user_id = $1 AND novel_id = $2 RETURNING *`,
          [userId, novelId, status],
        );

        if (updateResult.rows.length === 0)
          throw new Error('Novel not found for user');

        if (status === 'completed') {
          const meta = updateResult.rows[0];
          const currentRT = meta.current_read_through || 1;
          // Furthest-progressed snapshot, not most-recently-written — a
          // synthetic completion row built from whichever device wrote last
          // could archive and re-insert a *lower* chapter than the reader
          // actually reached (same ordering bug as ExportService.ts).
          const latestProgress = await client.query<{
            chapter_num: number;
            chapter_token: string;
            url: string;
            novel_id: string;
            percent: string;
          }>(
            'SELECT chapter_num, chapter_token, url, novel_id, percent FROM progress_snapshots WHERE user_id = $1 AND novel_id = $2 AND read_through_num = $3 ORDER BY chapter_num DESC, percent DESC, created_at DESC LIMIT 1',
            [userId, novelId, currentRT],
          );
          const archiveEntry = {
            read_through: currentRT,
            started_at: meta.started_at,
            completed_at: new Date().toISOString(),
            max_chapter: latestProgress.rows[0]?.chapter_num ?? 0,
            max_percent: parseFloat(latestProgress.rows[0]?.percent ?? '0'),
          };
          await client.query(
            `
            UPDATE user_novel_meta SET read_history = CASE
              WHEN NOT EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(read_history, '[]'::jsonb)) elem WHERE (elem->>'read_through')::int = $3)
              THEN COALESCE(read_history, '[]'::jsonb) || $4::jsonb ELSE read_history END
            WHERE user_id = $1 AND novel_id = $2
          `,
            [userId, novelId, currentRT, JSON.stringify(archiveEntry)],
          );

          if (latestProgress.rows.length > 0) {
            const lp = latestProgress.rows[0];
            await client.query(
              'INSERT INTO progress_snapshots (user_id, device_id, novel_id, chapter_token, chapter_num, percent, url, seconds_on_page, read_through_num) VALUES ($1, $2, $3, $4, $5, 100, $6, 0, $7)',
              [
                userId,
                'system',
                lp.novel_id,
                lp.chapter_token,
                lp.chapter_num,
                lp.url,
                currentRT,
              ],
            );
          }
        }

        return updateResult.rows[0];
      });

      res.json({
        success: true,
        status: result.status,
        updated_at: result.updated_at,
      });
    } catch (error) {
      handleDbError(res, error, 'Update novel status');
    }
  },
);

// POST /api/v1/novels/:novelId/progress-override
// Manual bookmark edit: writes a snapshot directly, bypassing the
// max-progress policy — the whole point is correcting the record.
router.post(
  '/api/v1/novels/:novelId/progress-override',
  requireAuthAPI,
  [
    param('novelId').isString().isLength({ min: 1, max: MAX_NOVEL_ID_LENGTH }),
    body('chapter_num').isInt({ min: 0 }),
    body('percent').optional().isFloat({ min: 0, max: 100 }),
    handleValidationErrors,
  ],
  validateApiKey,
  validateNovelId,
  async (req: Request, res: Response) => {
    const novelId = String(req.params.novelId);
    const userId = (req as AuthenticatedRequest).user.id;
    const { chapter_num, percent = 0 } = req.body as {
      chapter_num: number;
      percent?: number;
    };

    try {
      const result = await withTransaction(async (client) => {
        const meta = await client.query<{
          current_read_through: number | null;
        }>(
          'SELECT current_read_through FROM user_novel_meta WHERE user_id = $1 AND novel_id = $2',
          [userId, novelId],
        );
        if (meta.rows.length === 0)
          return { error: 'Novel not found', status: 404 };
        const readThrough = meta.rows[0].current_read_through ?? 1;

        await client.query(
          `INSERT INTO devices (id, user_id, device_label, device_type)
           VALUES ('manual', $1, 'Manual edit', 'unknown')
           ON CONFLICT (id) DO NOTHING`,
          [userId],
        );

        const novelUrl = await client.query<{ primary_url: string | null }>(
          'SELECT primary_url FROM novels WHERE id = $1',
          [novelId],
        );

        await client.query(
          `INSERT INTO progress_snapshots (user_id, device_id, novel_id, chapter_token, chapter_num, percent, url, seconds_on_page, read_through_num)
           VALUES ($1, 'manual', $2, 'chapter', $3, $4, $5, 0, $6)`,
          [
            userId,
            novelId,
            chapter_num,
            percent,
            novelUrl.rows[0]?.primary_url ?? null,
            readThrough,
          ],
        );

        await client.query(
          'UPDATE user_novel_meta SET updated_at = CURRENT_TIMESTAMP WHERE user_id = $1 AND novel_id = $2',
          [userId, novelId],
        );

        return {
          success: true,
          states: await getLatestStates(client, userId, novelId, readThrough),
        };
      });

      if ('error' in result)
        return res
          .status(result.status as number)
          .json({ error: result.error });
      res.json(result);
    } catch (error) {
      handleDbError(res, error, 'Progress override');
    }
  },
);

// POST /api/v1/novels/:novelId/reread
// API-key auth only (no session) so the userscript's "re-read from
// here" banner can call it — same trust level as progress writes.
router.post(
  '/api/v1/novels/:novelId/reread',
  [
    param('novelId').isString().isLength({ min: 1, max: MAX_NOVEL_ID_LENGTH }),
    handleValidationErrors,
  ],
  validateApiKey,
  validateNovelId,
  async (req: Request, res: Response) => {
    const { novelId } = req.params;
    const userId = (req as AuthenticatedRequest).user.id;

    try {
      const result = await withTransaction(async (client) => {
        const metaResult = await client.query(
          'SELECT * FROM user_novel_meta WHERE user_id = $1 AND novel_id = $2',
          [userId, novelId],
        );
        if (metaResult.rows.length === 0)
          return { error: 'Novel not found', status: 404 };

        const meta = metaResult.rows[0];
        const currentRT = meta.current_read_through || 1;

        const maxProgress = await client.query<{
          max_chapter: number;
          max_percent: string;
        }>(
          'SELECT MAX(chapter_num) as max_chapter, MAX(percent) as max_percent FROM progress_snapshots WHERE user_id = $1 AND novel_id = $2 AND read_through_num = $3',
          [userId, novelId, currentRT],
        );
        const archiveEntry = {
          read_through: currentRT,
          started_at: meta.started_at,
          completed_at: meta.completed_at ?? new Date().toISOString(),
          max_chapter: maxProgress.rows[0]?.max_chapter ?? 0,
          max_percent: parseFloat(maxProgress.rows[0]?.max_percent ?? '0'),
        };

        await client.query(
          `
          UPDATE user_novel_meta SET read_history = CASE
            WHEN NOT EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(read_history, '[]'::jsonb)) elem WHERE (elem->>'read_through')::int = $3)
            THEN COALESCE(read_history, '[]'::jsonb) || $4::jsonb ELSE read_history END
          WHERE user_id = $1 AND novel_id = $2
        `,
          [userId, novelId, currentRT, JSON.stringify(archiveEntry)],
        );

        const newRT = currentRT + 1;
        await client.query(
          "UPDATE user_novel_meta SET current_read_through = $3, started_at = CURRENT_TIMESTAMP, completed_at = NULL, status = 'reading', updated_at = CURRENT_TIMESTAMP WHERE user_id = $1 AND novel_id = $2",
          [userId, novelId, newRT],
        );

        return {
          success: true,
          current_read_through: newRT,
          status: 'reading',
        };
      });

      if ('error' in result)
        return res
          .status(result.status as number)
          .json({ error: result.error });
      res.json(result);
    } catch (error) {
      handleDbError(res, error, 'Start reread');
    }
  },
);

// GET /api/v1/novels/:novelId/synopsis
router.get(
  '/api/v1/novels/:novelId/synopsis',
  requireAuthAPI,
  validateApiKey,
  validateNovelId,
  async (req: Request, res: Response) => {
    const { novelId } = req.params;

    try {
      const result = await pool.query<{
        synopsis: string | null;
        synopsis_imported_at: string | null;
        primary_url: string | null;
      }>(
        'SELECT synopsis, synopsis_imported_at, primary_url FROM novels WHERE id = $1',
        [novelId],
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Novel not found' });
      }

      res.json(result.rows[0]);
    } catch (error) {
      handleDbError(res, error, 'Get novel synopsis');
    }
  },
);

// DELETE /api/v1/novels/:novelId
router.delete(
  '/api/v1/novels/:novelId',
  requireAuthAPI,
  validateApiKey,
  validateNovelId,
  async (req: Request, res: Response) => {
    const { novelId } = req.params;
    const { hard = false } = req.body as { hard?: boolean };
    const userId = (req as AuthenticatedRequest).user.id;

    try {
      await withTransaction(async (client) => {
        if (hard) {
          await client.query(
            'DELETE FROM bookmarks WHERE user_id = $1 AND novel_id = $2',
            [userId, novelId],
          );
          await client.query(
            'DELETE FROM reading_sessions WHERE user_id = $1 AND novel_id = $2',
            [userId, novelId],
          );
          await client.query(
            'DELETE FROM progress_snapshots WHERE user_id = $1 AND novel_id = $2',
            [userId, novelId],
          );
          await client.query(
            'DELETE FROM user_novel_meta WHERE user_id = $1 AND novel_id = $2',
            [userId, novelId],
          );
        } else {
          await client.query(
            `INSERT INTO user_novel_meta (user_id, novel_id, status, updated_at) VALUES ($1, $2, 'removed', CURRENT_TIMESTAMP) ON CONFLICT (user_id, novel_id) DO UPDATE SET status = 'removed', updated_at = CURRENT_TIMESTAMP`,
            [userId, novelId],
          );
        }
      });
      res.json({ success: true, removed: true, hard_delete: hard });
    } catch (error) {
      handleDbError(res, error, 'Delete novel');
    }
  },
);

// POST /api/v1/novels/:novelId/favorite
router.post(
  '/api/v1/novels/:novelId/favorite',
  requireAuthAPI,
  validateApiKey,
  validateNovelId,
  async (req: Request, res: Response) => {
    const userId = (req as AuthenticatedRequest).user.id;
    try {
      await pool.query(
        `INSERT INTO user_novel_meta (user_id, novel_id, favorite, updated_at) VALUES ($1, $2, TRUE, CURRENT_TIMESTAMP) ON CONFLICT (user_id, novel_id) DO UPDATE SET favorite = TRUE, updated_at = CURRENT_TIMESTAMP`,
        [userId, req.params.novelId],
      );
      res.json({ success: true, favorited: true });
    } catch (error) {
      handleDbError(res, error, 'Favorite novel');
    }
  },
);

// DELETE /api/v1/novels/:novelId/favorite
router.delete(
  '/api/v1/novels/:novelId/favorite',
  requireAuthAPI,
  validateApiKey,
  validateNovelId,
  async (req: Request, res: Response) => {
    const userId = (req as AuthenticatedRequest).user.id;
    try {
      await pool.query(
        'UPDATE user_novel_meta SET favorite = FALSE, updated_at = CURRENT_TIMESTAMP WHERE user_id = $1 AND novel_id = $2',
        [userId, req.params.novelId],
      );
      res.json({ success: true, favorited: false });
    } catch (error) {
      handleDbError(res, error, 'Unfavorite novel');
    }
  },
);

// GET /api/v1/novels/completed
router.get(
  '/api/v1/novels/completed',
  validateApiKey,
  validatePagination,
  async (req: Request, res: Response) => {
    const { limit, offset } = (req as AuthenticatedRequest).pagination;
    try {
      const result = await pool.query(
        "SELECT n.id, n.title, n.primary_url, n.author, n.genre, m.completed_at, m.rating, m.notes, m.favorite FROM user_novel_meta m JOIN novels n ON n.id = m.novel_id WHERE m.user_id = $1 AND m.status = 'completed' ORDER BY m.completed_at DESC LIMIT $2 OFFSET $3",
        [(req as AuthenticatedRequest).user.id, limit, offset],
      );
      res.json({
        novels: result.rows,
        pagination: { limit, offset, total: result.rows.length },
      });
    } catch (error) {
      handleDbError(res, error, 'Get completed novels');
    }
  },
);

// GET /api/v1/novels/favorites
router.get(
  '/api/v1/novels/favorites',
  validateApiKey,
  validatePagination,
  async (req: Request, res: Response) => {
    const { limit, offset } = (req as AuthenticatedRequest).pagination;
    try {
      const result = await pool.query(
        `SELECT n.id, n.title, n.primary_url, n.author, n.genre, m.status, m.rating, m.notes, m.updated_at FROM user_novel_meta m JOIN novels n ON n.id = m.novel_id WHERE m.user_id = $1 AND m.favorite = TRUE AND m.status <> 'removed' ORDER BY m.updated_at DESC LIMIT $2 OFFSET $3`,
        [(req as AuthenticatedRequest).user.id, limit, offset],
      );
      res.json({
        novels: result.rows,
        pagination: { limit, offset, total: result.rows.length },
      });
    } catch (error) {
      handleDbError(res, error, 'Get favorite novels');
    }
  },
);

// PUT /api/v1/novels/:novelId/notes (novel-level quick notes in meta, different from novel_notes table)
router.put(
  '/api/v1/novels/:novelId/notes',
  validateApiKey,
  validateNovelId,
  async (req: Request, res: Response) => {
    const { notes } = req.body as { notes?: string };
    const userId = (req as AuthenticatedRequest).user.id;
    try {
      await pool.query(
        `INSERT INTO user_novel_meta (user_id, novel_id, notes, updated_at) VALUES ($1, $2, $3, CURRENT_TIMESTAMP) ON CONFLICT (user_id, novel_id) DO UPDATE SET notes = EXCLUDED.notes, updated_at = CURRENT_TIMESTAMP`,
        [userId, req.params.novelId, notes ?? null],
      );
      res.json({ success: true });
    } catch (error) {
      handleDbError(res, error, 'Update novel notes');
    }
  },
);

// PUT /api/v1/novels/:novelId/rating
router.put(
  '/api/v1/novels/:novelId/rating',
  [
    param('novelId').isString().isLength({ min: 1, max: MAX_NOVEL_ID_LENGTH }),
    body('rating').isFloat({ min: 0, max: 5 }),
    handleValidationErrors,
  ],
  validateApiKey,
  validateNovelId,
  async (req: Request, res: Response) => {
    // Snap to the nearest half-star so client float drift can't write an
    // off-grid value (e.g. 3.3 from a rounding bug in a future client).
    const snapped = Math.round((req.body as { rating: number }).rating * 2) / 2;
    // 0 means "clear the rating" — the DB stores that as NULL (the existing
    // "unrated" convention; see the COALESCE(m.rating, 0) read paths above),
    // not literal 0, which the half-star CHECK constraint rejects.
    const ratingToStore = snapped === 0 ? null : snapped;
    const userId = (req as AuthenticatedRequest).user.id;
    try {
      await pool.query(
        `INSERT INTO user_novel_meta (user_id, novel_id, rating, updated_at) VALUES ($1, $2, $3, CURRENT_TIMESTAMP) ON CONFLICT (user_id, novel_id) DO UPDATE SET rating = EXCLUDED.rating, updated_at = CURRENT_TIMESTAMP`,
        [userId, req.params.novelId, ratingToStore],
      );
      res.json({ success: true, rating: snapped });
    } catch (error) {
      handleDbError(res, error, 'Update novel rating');
    }
  },
);

// POST /api/v1/novels/bulk-status
router.post(
  '/api/v1/novels/bulk-status',
  validateApiKey,
  [
    body('novel_ids').isArray({ min: 1 }),
    body('status').isIn([
      'reading',
      'completed',
      'on-hold',
      'dropped',
      'plan-to-read',
      'removed',
    ]),
    handleValidationErrors,
  ],
  async (req: Request, res: Response) => {
    const { novel_ids, status } = req.body as {
      novel_ids: string[];
      status: string;
    };
    try {
      const result = await pool.query(
        'UPDATE user_novel_meta SET status = $1, updated_at = NOW() WHERE user_id = $2 AND novel_id = ANY($3) RETURNING novel_id',
        [status, (req as AuthenticatedRequest).user.id, novel_ids],
      );
      res.json({
        success: true,
        updated: result.rows.length,
        novel_ids: result.rows.map((r: { novel_id: string }) => r.novel_id),
      });
    } catch (error) {
      handleDbError(res, error, 'Bulk status update');
    }
  },
);

// GET /api/v1/export
router.get(
  '/api/v1/export',
  validateApiKey,
  async (req: Request, res: Response) => {
    const userId = (req as AuthenticatedRequest).user.id;
    try {
      res.json(await buildExport(userId));
    } catch (error) {
      handleDbError(res, error, 'Export data');
    }
  },
);

// POST /api/v1/import
router.post(
  '/api/v1/import',
  validateApiKey,
  [body('data').isObject(), handleValidationErrors],
  async (req: Request, res: Response) => {
    const { data } = req.body as { data: Record<string, unknown[]> };
    const userId = (req as AuthenticatedRequest).user.id;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const imported = {
        novels: 0,
        progress: 0,
        bookmarks: 0,
        notes: 0,
        categories: 0,
      };

      if (Array.isArray(data.novels)) {
        for (const novel of data.novels as Record<string, unknown>[]) {
          await client.query(
            'INSERT INTO novels (id, title, primary_url, author, genre, description) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (id) DO NOTHING',
            [
              novel.id,
              novel.title,
              novel.primary_url,
              novel.author,
              novel.genre,
              novel.description,
            ],
          );
          if (
            novel.status ||
            novel.favorite ||
            novel.rating ||
            novel.notes ||
            novel.started_at ||
            novel.completed_at
          ) {
            await client.query(
              'INSERT INTO user_novel_meta (user_id, novel_id, status, favorite, rating, notes, started_at, completed_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (user_id, novel_id) DO UPDATE SET status = EXCLUDED.status, favorite = EXCLUDED.favorite, rating = EXCLUDED.rating, notes = EXCLUDED.notes, started_at = EXCLUDED.started_at, completed_at = EXCLUDED.completed_at',
              [
                userId,
                novel.id,
                novel.status,
                novel.favorite,
                novel.rating,
                novel.notes,
                novel.started_at,
                novel.completed_at,
              ],
            );
          }
          imported.novels++;
        }
      }
      if (Array.isArray(data.bookmarks)) {
        for (const b of data.bookmarks as Record<string, unknown>[]) {
          await client.query(
            'INSERT INTO bookmarks (user_id, novel_id, chapter_url, percent, bookmark_type, title, note) VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT DO NOTHING',
            [
              userId,
              b.novel_id,
              b.chapter_url,
              b.percent,
              b.bookmark_type,
              b.title,
              b.note,
            ],
          );
          imported.bookmarks++;
        }
      }
      if (Array.isArray(data.notes)) {
        for (const n of data.notes as Record<string, unknown>[]) {
          await client.query(
            'INSERT INTO novel_notes (user_id, novel_id, note_text, chapter_num) VALUES ($1, $2, $3, $4)',
            [userId, n.novel_id, n.note_text, n.chapter_num],
          );
          imported.notes++;
        }
      }
      if (Array.isArray(data.categories)) {
        for (const c of data.categories as Record<string, unknown>[]) {
          await client.query(
            'INSERT INTO novel_categories (user_id, novel_id, category) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
            [userId, c.novel_id, c.category],
          );
          imported.categories++;
        }
      }

      await client.query('COMMIT');
      res.json({ success: true, imported });
    } catch (error) {
      await client.query('ROLLBACK');
      handleDbError(res, error, 'Import data');
    } finally {
      client.release();
    }
  },
);

export default router;
