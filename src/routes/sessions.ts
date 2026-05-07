import { Router } from 'express';
import {
  HTTP_BAD_REQUEST,
  HTTP_CREATED,
  HTTP_NOT_FOUND,
  MS_PER_SECOND,
} from '../config.js';
import pool from '../db/pool.js';
import { validateApiKey } from '../middleware/auth.js';
import { handleDbError } from '../middleware/errorHandler.js';
import {
  validateNovelId,
  validatePagination,
} from '../middleware/validation.js';
import type { AuthenticatedRequest } from '../types/index.js';

const router = Router();

router.get(
  '/api/v1/sessions',
  validateApiKey,
  validatePagination,
  async (req, res) => {
    // biome-ignore lint/style/noNonNullAssertion: pagination guaranteed by validatePagination middleware
    const { limit, offset } = (req as AuthenticatedRequest).pagination!;
    const { novel_id, device_id } = req.query as {
      novel_id?: string;
      device_id?: string;
    };
    const user_id = (req as AuthenticatedRequest).user.id;

    try {
      let query = `
      SELECT s.id, s.novel_id, n.title, s.device_id, d.device_label, s.session_type,
             s.start_time, s.end_time, s.start_percent, s.end_percent, s.time_spent_seconds
      FROM reading_sessions s
      JOIN novels n ON n.id = s.novel_id
      JOIN devices d ON d.id = s.device_id
      WHERE s.user_id = $1
    `;
      const params: unknown[] = [user_id];

      if (novel_id) {
        query += ` AND s.novel_id = $${params.length + 1}`;
        params.push(novel_id);
      }
      if (device_id) {
        query += ` AND s.device_id = $${params.length + 1}`;
        params.push(device_id);
      }

      query += ` ORDER BY s.start_time DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
      params.push(limit, offset);

      const result = await pool.query(query, params);

      res.json({
        sessions: result.rows,
        pagination: { limit, offset, total: result.rows.length },
      });
    } catch (error) {
      handleDbError(res, error, 'Get reading sessions');
    }
  },
);

router.get('/api/v1/sessions/active', validateApiKey, async (req, res) => {
  const user_id = (req as AuthenticatedRequest).user.id;

  try {
    const result = await pool.query(
      `
      SELECT s.id, s.novel_id, n.title, s.device_id, d.device_label,
             s.start_time, s.start_percent,
             EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - s.start_time))::int AS duration_seconds
      FROM reading_sessions s
      JOIN novels n ON n.id = s.novel_id
      JOIN devices d ON d.id = s.device_id
      WHERE s.user_id = $1 AND s.end_time IS NULL
      ORDER BY s.start_time DESC
    `,
      [user_id],
    );

    res.json(result.rows);
  } catch (error) {
    handleDbError(res, error, 'Get active sessions');
  }
});

router.get(
  '/api/v1/sessions/:novelId',
  validateApiKey,
  validateNovelId,
  async (req, res) => {
    const user_id = (req as AuthenticatedRequest).user.id;

    try {
      const result = await pool.query(
        `
      SELECT s.id, s.device_id, d.device_label, s.session_type,
             s.start_time, s.end_time, s.start_percent, s.end_percent, s.time_spent_seconds
      FROM reading_sessions s
      JOIN devices d ON d.id = s.device_id
      WHERE s.user_id = $1 AND s.novel_id = $2
      ORDER BY s.start_time DESC
    `,
        [user_id, req.params.novelId],
      );

      res.json(result.rows);
    } catch (error) {
      handleDbError(res, error, 'Get novel sessions');
    }
  },
);

router.post('/api/v1/sessions', validateApiKey, async (req, res) => {
  const {
    novel_id,
    device_id,
    session_type = 'manual',
    start_time,
    start_percent,
  } = req.body as Record<string, unknown>;
  const user_id = (req as AuthenticatedRequest).user.id;

  if (!novel_id || !device_id) {
    return res
      .status(HTTP_BAD_REQUEST)
      .json({ error: 'Missing required fields: novel_id, device_id' });
  }

  const validTypes = ['auto', 'manual', 'imported'];
  if (!validTypes.includes(String(session_type))) {
    return res
      .status(HTTP_BAD_REQUEST)
      .json({ error: 'Invalid session_type', allowed: validTypes });
  }

  try {
    const result = await pool.query(
      `
      INSERT INTO reading_sessions (user_id, novel_id, device_id, session_type, start_time, start_percent)
      VALUES ($1, $2, $3, $4, COALESCE($5::timestamp, CURRENT_TIMESTAMP), $6)
      RETURNING id, start_time
    `,
      [
        user_id,
        novel_id,
        device_id,
        session_type,
        start_time || null,
        start_percent != null ? Number(start_percent) : null,
      ],
    );

    res.status(HTTP_CREATED).json({
      success: true,
      id: result.rows[0].id,
      start_time: result.rows[0].start_time,
    });
  } catch (error) {
    handleDbError(res, error, 'Start reading session');
  }
});

router.put(
  '/api/v1/sessions/:sessionId/end',
  validateApiKey,
  async (req, res) => {
    const { sessionId } = req.params;
    const { end_time, end_percent, time_spent_seconds } = req.body as Record<
      string,
      unknown
    >;
    const user_id = (req as AuthenticatedRequest).user.id;

    try {
      const sessionResult = await pool.query<{ start_time: Date }>(
        `
      SELECT start_time FROM reading_sessions
      WHERE id = $1 AND user_id = $2 AND end_time IS NULL
    `,
        [Number(sessionId), user_id],
      );

      if (sessionResult.rows.length === 0) {
        return res
          .status(HTTP_NOT_FOUND)
          .json({ error: 'Active session not found' });
      }

      const startTime = new Date(sessionResult.rows[0].start_time);
      const endTime = end_time ? new Date(String(end_time)) : new Date();
      const calculatedDuration =
        time_spent_seconds != null
          ? Number(time_spent_seconds)
          : Math.max(
              0,
              Math.floor(
                (endTime.getTime() - startTime.getTime()) / MS_PER_SECOND,
              ),
            );

      await pool.query(
        `
      UPDATE reading_sessions
      SET end_time = COALESCE($1::timestamp, CURRENT_TIMESTAMP),
          end_percent = $2,
          time_spent_seconds = $3
      WHERE id = $4 AND user_id = $5
    `,
        [
          end_time || null,
          end_percent != null ? Number(end_percent) : null,
          calculatedDuration,
          Number(sessionId),
          user_id,
        ],
      );

      res.json({ success: true, duration_seconds: calculatedDuration });
    } catch (error) {
      handleDbError(res, error, 'End reading session');
    }
  },
);

export default router;
