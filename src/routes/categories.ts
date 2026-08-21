import { Router } from 'express';
import { body, param, validationResult } from 'express-validator';
import { HTTP_BAD_REQUEST, HTTP_CREATED, HTTP_NOT_FOUND } from '../config.js';
import pool from '../db/pool.js';
import { validateApiKey } from '../middleware/auth.js';
import { handleDbError } from '../middleware/errorHandler.js';
import { validateNovelId } from '../middleware/validation.js';
import type { AuthenticatedRequest } from '../types/index.js';

const MAX_CATEGORY_LENGTH = 40;

const router = Router();

// All tag assignments for the user in one call — the SPA aggregates
// per-novel chips and tag counts client-side, avoiding N+1 fetches.
router.get('/api/v1/categories', validateApiKey, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT novel_id, category FROM novel_categories
       WHERE user_id = $1 ORDER BY category, novel_id`,
      [(req as AuthenticatedRequest).user.id],
    );
    res.json(result.rows);
  } catch (error) {
    handleDbError(res, error, 'List categories');
  }
});

router.post(
  '/api/v1/novels/:novelId/categories',
  validateApiKey,
  validateNovelId,
  body('category').trim().isLength({ min: 1, max: MAX_CATEGORY_LENGTH }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(HTTP_BAD_REQUEST).json({ errors: errors.array() });
    }

    try {
      const { category } = req.body as { category: string };
      const result = await pool.query(
        `INSERT INTO novel_categories (user_id, novel_id, category)
         VALUES ($1, $2, $3)
         ON CONFLICT DO NOTHING
         RETURNING novel_id, category`,
        [(req as AuthenticatedRequest).user.id, req.params.novelId, category],
      );
      res
        .status(HTTP_CREATED)
        .json(result.rows[0] ?? { novel_id: req.params.novelId, category });
    } catch (error) {
      handleDbError(res, error, 'Add category');
    }
  },
);

router.delete(
  '/api/v1/novels/:novelId/categories/:category',
  validateApiKey,
  validateNovelId,
  param('category').isLength({ min: 1, max: MAX_CATEGORY_LENGTH }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(HTTP_BAD_REQUEST).json({ errors: errors.array() });
    }

    try {
      const result = await pool.query(
        `DELETE FROM novel_categories
         WHERE user_id = $1 AND novel_id = $2 AND category = $3
         RETURNING category`,
        [
          (req as AuthenticatedRequest).user.id,
          req.params.novelId,
          req.params.category,
        ],
      );

      if (result.rows.length === 0) {
        return res.status(HTTP_NOT_FOUND).json({ error: 'Tag not found' });
      }

      res.json({ success: true });
    } catch (error) {
      handleDbError(res, error, 'Remove category');
    }
  },
);

export default router;
