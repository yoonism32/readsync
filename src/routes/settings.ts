import { Router } from 'express';
import { HTTP_BAD_REQUEST, HTTP_INTERNAL_ERROR } from '../config.js';
import pool from '../db/pool.js';
import logger from '../logger.js';
import { requireAuthAPI, validateApiKey } from '../middleware/auth.js';
import { handleDbError } from '../middleware/errorHandler.js';
import type { AuthenticatedRequest } from '../types/index.js';

const router = Router();

router.get(
  '/api/v1/settings/last-refresh',
  requireAuthAPI,
  validateApiKey,
  async (req, res) => {
    try {
      const result = await pool.query(
        `
      SELECT value, updated_at
      FROM user_settings
      WHERE user_id = $1 AND key = 'last_novel_refresh'
    `,
        [(req as AuthenticatedRequest).user.id],
      );

      if (result.rows.length === 0) {
        return res.json({ last_refresh: null, updated_at: null });
      }

      res.json({
        last_refresh: result.rows[0].value,
        updated_at: result.rows[0].updated_at,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to get last refresh time');
      res.status(HTTP_INTERNAL_ERROR).json({ error: 'Internal server error' });
    }
  },
);

router.post(
  '/api/v1/settings/last-refresh',
  requireAuthAPI,
  validateApiKey,
  async (req, res) => {
    const { timestamp } = req.body as { timestamp?: string };

    if (!timestamp) {
      return res.status(HTTP_BAD_REQUEST).json({ error: 'Missing timestamp' });
    }

    try {
      await pool.query(
        `
      INSERT INTO user_settings (user_id, key, value, updated_at)
      VALUES ($1, 'last_novel_refresh', $2, CURRENT_TIMESTAMP)
      ON CONFLICT (user_id, key)
      DO UPDATE SET value = $2, updated_at = CURRENT_TIMESTAMP
    `,
        [(req as AuthenticatedRequest).user.id, timestamp],
      );

      logger.info(
        { user_id: (req as AuthenticatedRequest).user.id, timestamp },
        'Saved last refresh time',
      );

      res.json({ success: true, last_refresh: timestamp });
    } catch (error) {
      handleDbError(res, error, 'Save last refresh time');
    }
  },
);

export default router;
