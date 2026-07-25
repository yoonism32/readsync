import { Router } from 'express';
import { body } from 'express-validator';
import {
  HTTP_BAD_REQUEST,
  HTTP_CONFLICT,
  HTTP_CREATED,
  HTTP_NOT_FOUND,
  MAX_NOTE_TEXT_LENGTH,
  MAX_NOVEL_ID_LENGTH,
  MAX_PERCENT,
  MIN_PERCENT,
} from '../config.js';
import pool, { withTransaction } from '../db/pool.js';
import { validateApiKey } from '../middleware/auth.js';
import { handleDbError } from '../middleware/errorHandler.js';
import {
  handleValidationErrors,
  validateNovelId,
  validatePagination,
} from '../middleware/validation.js';
import { deriveNovelMainUrl, extractNovelTitle } from '../services/NovelService.js';
import type { AuthenticatedRequest } from '../types/index.js';

const router = Router();

router.get(
  '/api/v1/bookmarks/:novelId',
  validateApiKey,
  validateNovelId,
  async (req, res) => {
    const user_id = (req as AuthenticatedRequest).user.id;

    try {
      const result = await pool.query(
        `
      SELECT id, chapter_url, percent, bookmark_type, title, note, created_at
      FROM bookmarks
      WHERE user_id = $1 AND novel_id = $2
      ORDER BY created_at DESC
    `,
        [user_id, req.params.novelId],
      );

      res.json(result.rows);
    } catch (error) {
      handleDbError(res, error, 'Get novel bookmarks');
    }
  },
);

router.get(
  '/api/v1/bookmarks',
  validateApiKey,
  validatePagination,
  async (req, res) => {
    // biome-ignore lint/style/noNonNullAssertion: pagination guaranteed by validatePagination middleware
    const { limit, offset } = (req as AuthenticatedRequest).pagination!;
    const { bookmark_type } = req.query as { bookmark_type?: string };
    const user_id = (req as AuthenticatedRequest).user.id;

    try {
      let query = `
      SELECT b.id, b.novel_id, n.title, b.chapter_url, b.percent,
             b.bookmark_type, b.title AS bookmark_title, b.note, b.created_at
      FROM bookmarks b
      JOIN novels n ON n.id = b.novel_id
      WHERE b.user_id = $1
    `;
      const params: unknown[] = [user_id];

      if (bookmark_type) {
        query += ` AND b.bookmark_type = $${params.length + 1}`;
        params.push(bookmark_type);
      }

      query += ` ORDER BY b.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
      params.push(limit, offset);

      const result = await pool.query(query, params);

      res.json({
        bookmarks: result.rows,
        pagination: { limit, offset, total: result.rows.length },
      });
    } catch (error) {
      handleDbError(res, error, 'Get bookmarks');
    }
  },
);

router.post(
  '/api/v1/bookmarks',
  [
    body('novel_id').isString().isLength({ min: 1, max: MAX_NOVEL_ID_LENGTH }),
    body('chapter_url').isURL(),
    body('percent').isFloat({ min: MIN_PERCENT, max: MAX_PERCENT }),
    body('bookmark_type')
      .optional()
      .isIn(['position', 'highlight', 'note', 'favorite']),
    body('title').optional().isString().isLength({ max: 500 }),
    body('note').optional().isString().isLength({ max: MAX_NOTE_TEXT_LENGTH }),
    handleValidationErrors,
  ],
  validateApiKey,
  async (req: import('express').Request, res: import('express').Response) => {
    const {
      novel_id,
      chapter_url,
      percent,
      bookmark_type = 'position',
      title,
      note,
    } = req.body as Record<string, unknown>;
    const user_id = (req as AuthenticatedRequest).user.id;
    const percentValue = Math.max(
      MIN_PERCENT,
      Math.min(MAX_PERCENT, Number(percent)),
    );

    try {
      const result = await withTransaction(async (client) => {
        await client.query(
          `
          INSERT INTO novels (id, title, primary_url)
          VALUES ($1, $2, $3)
          ON CONFLICT (id) DO NOTHING
        `,
          [novel_id, extractNovelTitle(chapter_url as string), deriveNovelMainUrl(chapter_url as string)],
        );

        const insertResult = await client.query(
          `
          INSERT INTO bookmarks (user_id, novel_id, chapter_url, percent, bookmark_type, title, note)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING id, created_at
        `,
          [
            user_id,
            novel_id,
            chapter_url,
            percentValue,
            bookmark_type,
            title || null,
            note || null,
          ],
        );

        return insertResult.rows[0] as { id: number; created_at: Date };
      });

      res
        .status(HTTP_CREATED)
        .json({ success: true, id: result.id, created_at: result.created_at });
    } catch (error: unknown) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { code: string }).code === '23505'
      ) {
        return res
          .status(HTTP_CONFLICT)
          .json({ error: 'Bookmark already exists at this position' });
      }
      handleDbError(res, error, 'Create bookmark');
    }
  },
);

router.put(
  '/api/v1/bookmarks/:bookmarkId',
  validateApiKey,
  async (req, res) => {
    const { bookmarkId } = req.params;
    const { percent, bookmark_type, title, note } = req.body as Record<
      string,
      unknown
    >;
    const user_id = (req as AuthenticatedRequest).user.id;

    const validTypes = ['position', 'highlight', 'note', 'favorite'];
    if (bookmark_type && !validTypes.includes(String(bookmark_type))) {
      return res
        .status(HTTP_BAD_REQUEST)
        .json({ error: 'Invalid bookmark_type', allowed: validTypes });
    }

    try {
      const updates: string[] = [];
      const params: unknown[] = [user_id];
      let paramIndex = 1;

      if (percent != null) {
        updates.push(`percent = $${++paramIndex}`);
        params.push(
          Math.max(MIN_PERCENT, Math.min(MAX_PERCENT, Number(percent))),
        );
      }
      if (bookmark_type) {
        updates.push(`bookmark_type = $${++paramIndex}`);
        params.push(bookmark_type);
      }
      if (title !== undefined) {
        updates.push(`title = $${++paramIndex}`);
        params.push(title);
      }
      if (note !== undefined) {
        updates.push(`note = $${++paramIndex}`);
        params.push(note);
      }

      if (updates.length === 0) {
        return res.json({ success: true, message: 'No changes provided' });
      }

      params.push(Number(bookmarkId));

      const result = await pool.query(
        `
      UPDATE bookmarks
      SET ${updates.join(', ')}
      WHERE user_id = $1 AND id = $${params.length}
      RETURNING id
    `,
        params,
      );

      if (result.rows.length === 0) {
        return res.status(HTTP_NOT_FOUND).json({ error: 'Bookmark not found' });
      }

      res.json({ success: true });
    } catch (error) {
      handleDbError(res, error, 'Update bookmark');
    }
  },
);

router.delete(
  '/api/v1/bookmarks/:bookmarkId',
  validateApiKey,
  async (req, res) => {
    const { bookmarkId } = req.params;
    const user_id = (req as AuthenticatedRequest).user.id;

    try {
      const result = await pool.query(
        `
      DELETE FROM bookmarks
      WHERE user_id = $1 AND id = $2
      RETURNING id
    `,
        [user_id, Number(bookmarkId)],
      );

      if (result.rows.length === 0) {
        return res.status(HTTP_NOT_FOUND).json({ error: 'Bookmark not found' });
      }

      res.json({ success: true });
    } catch (error) {
      handleDbError(res, error, 'Delete bookmark');
    }
  },
);

export default router;
