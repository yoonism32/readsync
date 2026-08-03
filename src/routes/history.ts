import { Router } from 'express';
import { query, validationResult } from 'express-validator';
import { HTTP_BAD_REQUEST } from '../config.js';
import pool from '../db/pool.js';
import { validateApiKey } from '../middleware/auth.js';
import { handleDbError } from '../middleware/errorHandler.js';
import type { AuthenticatedRequest } from '../types/index.js';

const DEFAULT_HISTORY_DAYS = 30;
const MAX_HISTORY_DAYS = 365;

const router = Router();

// Reading history timeline: one row per day+novel, aggregated over the
// raw snapshot stream (which fires every few seconds while reading).
router.get(
  '/api/v1/history',
  validateApiKey,
  query('days').optional().isInt({ min: 1, max: MAX_HISTORY_DAYS }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(HTTP_BAD_REQUEST).json({ errors: errors.array() });
    }

    const days = Number(
      (req.query as Record<string, string>).days ?? DEFAULT_HISTORY_DAYS,
    );
    const user_id = (req as AuthenticatedRequest).user.id;

    try {
      const result = await pool.query(
        `
        SELECT
          DATE(p.created_at) AS date,
          p.novel_id,
          n.title,
          MIN(p.chapter_num) AS from_chapter,
          MAX(p.chapter_num) AS to_chapter,
          MAX(p.percent) AS max_percent,
          COUNT(*) AS events,
          ARRAY_AGG(DISTINCT COALESCE(d.device_label, p.device_id)) AS devices,
          MAX(p.created_at) AS last_event,
          MAX(p.read_through_num) AS read_through
        FROM progress_snapshots p
        JOIN novels n ON n.id = p.novel_id
        LEFT JOIN devices d ON d.id = p.device_id
        WHERE p.user_id = $1
          AND p.created_at >= NOW() - $2 * interval '1 day'
        GROUP BY DATE(p.created_at), p.novel_id, n.title
        ORDER BY date DESC, last_event DESC
      `,
        [user_id, days],
      );

      res.json(result.rows);
    } catch (error) {
      handleDbError(res, error, 'Get reading history');
    }
  },
);

export default router;
