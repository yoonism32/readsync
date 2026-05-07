import { Router } from 'express';
import { body, param, validationResult } from 'express-validator';
import {
  HTTP_BAD_REQUEST,
  HTTP_CREATED,
  HTTP_NOT_FOUND,
  MAX_NOTE_TEXT_LENGTH,
} from '../config.js';
import pool from '../db/pool.js';
import { validateApiKey } from '../middleware/auth.js';
import { handleDbError } from '../middleware/errorHandler.js';
import { validateNovelId } from '../middleware/validation.js';
import type { AuthenticatedRequest } from '../types/index.js';

const router = Router();

router.get(
  '/api/v1/novels/:novelId/notes',
  validateApiKey,
  validateNovelId,
  async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT id, note_text, chapter_num, created_at, updated_at
       FROM novel_notes
       WHERE user_id = $1 AND novel_id = $2
       ORDER BY created_at DESC`,
        [(req as AuthenticatedRequest).user.id, req.params.novelId],
      );
      res.json(result.rows);
    } catch (error) {
      handleDbError(res, error, 'Get novel notes');
    }
  },
);

router.post(
  '/api/v1/novels/:novelId/notes',
  validateApiKey,
  validateNovelId,
  body('note_text').trim().isLength({ min: 1, max: MAX_NOTE_TEXT_LENGTH }),
  body('chapter_num').optional().isInt({ min: 0 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(HTTP_BAD_REQUEST).json({ errors: errors.array() });
    }

    try {
      const { note_text, chapter_num } = req.body as {
        note_text: string;
        chapter_num?: number;
      };
      const result = await pool.query(
        `INSERT INTO novel_notes (user_id, novel_id, note_text, chapter_num)
         VALUES ($1, $2, $3, $4)
         RETURNING id, note_text, chapter_num, created_at, updated_at`,
        [
          (req as AuthenticatedRequest).user.id,
          req.params.novelId,
          note_text,
          chapter_num || null,
        ],
      );
      res.status(HTTP_CREATED).json(result.rows[0]);
    } catch (error) {
      handleDbError(res, error, 'Create novel note');
    }
  },
);

router.put(
  '/api/v1/notes/:noteId',
  validateApiKey,
  param('noteId').isInt(),
  body('note_text').trim().isLength({ min: 1, max: MAX_NOTE_TEXT_LENGTH }),
  body('chapter_num').optional().isInt({ min: 0 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(HTTP_BAD_REQUEST).json({ errors: errors.array() });
    }

    try {
      const { note_text, chapter_num } = req.body as {
        note_text: string;
        chapter_num?: number;
      };
      const result = await pool.query(
        `UPDATE novel_notes
         SET note_text = $1, chapter_num = $2, updated_at = NOW()
         WHERE id = $3 AND user_id = $4
         RETURNING id, note_text, chapter_num, created_at, updated_at`,
        [
          note_text,
          chapter_num || null,
          req.params.noteId,
          (req as AuthenticatedRequest).user.id,
        ],
      );

      if (result.rows.length === 0) {
        return res.status(HTTP_NOT_FOUND).json({ error: 'Note not found' });
      }

      res.json(result.rows[0]);
    } catch (error) {
      handleDbError(res, error, 'Update note');
    }
  },
);

router.delete(
  '/api/v1/notes/:noteId',
  validateApiKey,
  param('noteId').isInt(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(HTTP_BAD_REQUEST).json({ errors: errors.array() });
    }

    try {
      const result = await pool.query(
        `DELETE FROM novel_notes WHERE id = $1 AND user_id = $2 RETURNING id`,
        [req.params.noteId, (req as AuthenticatedRequest).user.id],
      );

      if (result.rows.length === 0) {
        return res.status(HTTP_NOT_FOUND).json({ error: 'Note not found' });
      }

      res.json({ success: true, message: 'Note deleted' });
    } catch (error) {
      handleDbError(res, error, 'Delete note');
    }
  },
);

export default router;
