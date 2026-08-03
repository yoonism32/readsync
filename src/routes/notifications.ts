import type { Request, Response } from 'express';
import { Router } from 'express';
import { param } from 'express-validator';
import pool from '../db/pool.js';
import { validateApiKey } from '../middleware/auth.js';
import { handleDbError } from '../middleware/errorHandler.js';
import { handleValidationErrors } from '../middleware/validation.js';
import type { AuthenticatedRequest } from '../types/index.js';

const router = Router();

const MAX_NOTIFICATIONS = 50;

// GET /api/v1/notifications — newest first, with unread count
router.get(
  '/api/v1/notifications',
  validateApiKey,
  async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthenticatedRequest).user.id;
      const unreadOnly = req.query.unread_only === 'true';

      const rows = await pool.query(
        `SELECT n.id, n.novel_id, n.type, n.message, n.read, n.created_at,
                nov.title AS novel_title
         FROM notifications n
         LEFT JOIN novels nov ON nov.id = n.novel_id
         WHERE n.user_id = $1 ${unreadOnly ? 'AND n.read = FALSE' : ''}
         ORDER BY n.created_at DESC
         LIMIT $2`,
        [userId, MAX_NOTIFICATIONS],
      );

      const unread = await pool.query<{ count: string }>(
        'SELECT COUNT(*) AS count FROM notifications WHERE user_id = $1 AND read = FALSE',
        [userId],
      );

      res.json({
        notifications: rows.rows,
        unread_count: Number(unread.rows[0]?.count ?? 0),
      });
    } catch (error) {
      handleDbError(res, error, 'List notifications');
    }
  },
);

// POST /api/v1/notifications/:id/read
router.post(
  '/api/v1/notifications/:id/read',
  validateApiKey,
  param('id').isInt({ min: 1 }),
  handleValidationErrors,
  async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthenticatedRequest).user.id;
      await pool.query(
        'UPDATE notifications SET read = TRUE WHERE id = $1 AND user_id = $2',
        [Number(req.params.id), userId],
      );
      res.json({ success: true });
    } catch (error) {
      handleDbError(res, error, 'Mark notification read');
    }
  },
);

// POST /api/v1/notifications/read-all
router.post(
  '/api/v1/notifications/read-all',
  validateApiKey,
  async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthenticatedRequest).user.id;
      await pool.query(
        'UPDATE notifications SET read = TRUE WHERE user_id = $1 AND read = FALSE',
        [userId],
      );
      res.json({ success: true });
    } catch (error) {
      handleDbError(res, error, 'Mark all notifications read');
    }
  },
);

export default router;
