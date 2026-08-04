import { Router } from 'express';
import {
  DEFAULT_ANALYTICS_DAYS,
  HTTP_NOT_FOUND,
  MS_PER_DAY,
} from '../config.js';
import pool from '../db/pool.js';
import { validateApiKey } from '../middleware/auth.js';
import { handleDbError } from '../middleware/errorHandler.js';
import { validateNovelId } from '../middleware/validation.js';
import type { AuthenticatedRequest } from '../types/index.js';

const router = Router();

router.get('/api/v1/stats/summary', validateApiKey, async (req, res) => {
  const user_id = (req as AuthenticatedRequest).user.id;

  try {
    const client = await pool.connect();
    try {
      const [
        totalNovels,
        statusCounts,
        avgProgress,
        sessionStats,
        bookmarkCount,
        deviceCount,
      ] = await Promise.all([
        client.query(
          `SELECT COUNT(DISTINCT novel_id) AS total FROM progress_snapshots WHERE user_id = $1`,
          [user_id],
        ),
        client.query(
          `SELECT status, COUNT(*) AS count FROM user_novel_meta WHERE user_id = $1 AND status <> 'removed' GROUP BY status`,
          [user_id],
        ),
        client.query(
          `WITH latest AS (
               SELECT DISTINCT ON (novel_id) novel_id, percent
               FROM progress_snapshots WHERE user_id = $1
               ORDER BY novel_id, created_at DESC
             )
             SELECT COALESCE(ROUND(AVG(percent)::numeric, 2), 0)::float AS avg_progress FROM latest`,
          [user_id],
        ),
        client.query(
          `SELECT COUNT(*) AS total_sessions,
                    COALESCE(SUM(time_spent_seconds), 0) AS total_seconds,
                    COALESCE(ROUND(AVG(time_spent_seconds)::numeric, 0), 0)::int AS avg_session_seconds
             FROM reading_sessions WHERE user_id = $1 AND end_time IS NOT NULL`,
          [user_id],
        ),
        client.query(
          `SELECT COUNT(*) AS total FROM bookmarks WHERE user_id = $1`,
          [user_id],
        ),
        client.query(
          `SELECT COUNT(*) AS total FROM devices WHERE user_id = $1 AND active = TRUE`,
          [user_id],
        ),
      ]);

      const statusMap: Record<string, number> = {};
      for (const row of statusCounts.rows) {
        statusMap[row.status as string] = Number(row.count);
      }

      res.json({
        total_novels: Number(totalNovels.rows[0]?.total ?? 0),
        novels_by_status: {
          reading: statusMap.reading ?? 0,
          completed: statusMap.completed ?? 0,
          'on-hold': statusMap['on-hold'] ?? 0,
          dropped: statusMap.dropped ?? 0,
          'plan-to-read': statusMap['plan-to-read'] ?? 0,
        },
        avg_progress: Number(avgProgress.rows[0]?.avg_progress ?? 0),
        reading_sessions: {
          total: Number(sessionStats.rows[0]?.total_sessions ?? 0),
          total_time_seconds: Number(sessionStats.rows[0]?.total_seconds ?? 0),
          avg_session_seconds: Number(
            sessionStats.rows[0]?.avg_session_seconds ?? 0,
          ),
        },
        total_bookmarks: Number(bookmarkCount.rows[0]?.total ?? 0),
        active_devices: Number(deviceCount.rows[0]?.total ?? 0),
      });
    } finally {
      client.release();
    }
  } catch (error) {
    handleDbError(res, error, 'Get statistics summary');
  }
});

/**
 * Library health — a plain accounting of what is actually stored, so a display
 * problem can be told apart from missing data at a glance. Added after a
 * device-filter bug made 117 novels read "0 / N" while every snapshot was
 * still on disk.
 */
router.get('/api/v1/stats/library', validateApiKey, async (req, res) => {
  const user_id = (req as AuthenticatedRequest).user.id;

  try {
    const result = await pool.query(
      `
      SELECT
        (SELECT COUNT(*) FROM novels) AS novels_tracked,
        (SELECT COUNT(*) FROM progress_snapshots WHERE user_id = $1) AS progress_snapshots,
        (SELECT COUNT(DISTINCT novel_id) FROM progress_snapshots WHERE user_id = $1) AS novels_with_progress,
        (SELECT MIN(created_at) FROM progress_snapshots WHERE user_id = $1) AS oldest_snapshot,
        (SELECT MAX(created_at) FROM progress_snapshots WHERE user_id = $1) AS newest_snapshot,
        (SELECT COUNT(*) FROM novel_notes WHERE user_id = $1) AS notes,
        (SELECT COUNT(*) FROM bookmarks WHERE user_id = $1) AS bookmarks
      `,
      [user_id],
    );

    const row = result.rows[0] ?? {};
    const novelsTracked = Number(row.novels_tracked ?? 0);
    const novelsWithProgress = Number(row.novels_with_progress ?? 0);

    res.json({
      novels_tracked: novelsTracked,
      novels_with_progress: novelsWithProgress,
      novels_without_progress: Math.max(novelsTracked - novelsWithProgress, 0),
      progress_snapshots: Number(row.progress_snapshots ?? 0),
      oldest_snapshot: row.oldest_snapshot ?? null,
      newest_snapshot: row.newest_snapshot ?? null,
      notes: Number(row.notes ?? 0),
      bookmarks: Number(row.bookmarks ?? 0),
    });
  } catch (error) {
    handleDbError(res, error, 'Get library health');
  }
});

router.get('/api/v1/stats/daily', validateApiKey, async (req, res) => {
  const {
    from,
    to,
    days = String(DEFAULT_ANALYTICS_DAYS),
  } = req.query as Record<string, string>;
  const user_id = (req as AuthenticatedRequest).user.id;

  const fromDate = from
    ? new Date(from)
    : new Date(Date.now() - Number(days) * MS_PER_DAY);
  const toDate = to ? new Date(to) : new Date();

  try {
    const result = await pool.query(
      `
      WITH date_range AS (
        SELECT generate_series($2::date, $3::date, '1 day'::interval)::date AS date
      ),
      daily_snapshots AS (
        SELECT
          DATE(created_at) AS date,
          COUNT(*) AS snapshot_events,
          COUNT(DISTINCT novel_id) AS novels_touched,
          COUNT(DISTINCT (novel_id, chapter_num)) AS chapters_read
        FROM progress_snapshots
        WHERE user_id = $1
          AND created_at >= $2
          AND created_at <= $3 + interval '1 day'
        GROUP BY DATE(created_at)
      ),
      daily_sessions AS (
        SELECT
          DATE(start_time) AS date,
          COUNT(*) AS sessions,
          COALESCE(SUM(time_spent_seconds), 0) AS session_seconds
        FROM reading_sessions
        WHERE user_id = $1
          AND start_time >= $2
          AND start_time <= $3 + interval '1 day'
          AND end_time IS NOT NULL
        GROUP BY DATE(start_time)
      )
      SELECT
        dr.date,
        COALESCE(ds.snapshot_events, 0) AS snapshot_events,
        COALESCE(ds.novels_touched, 0) AS novels_touched,
        COALESCE(ds.chapters_read, 0) AS chapters_read,
        COALESCE(sess.sessions, 0) AS sessions,
        COALESCE(sess.session_seconds, 0) AS session_seconds
      FROM date_range dr
      LEFT JOIN daily_snapshots ds ON dr.date = ds.date
      LEFT JOIN daily_sessions sess ON dr.date = sess.date
      ORDER BY dr.date ASC
    `,
      [
        user_id,
        fromDate.toISOString().split('T')[0],
        toDate.toISOString().split('T')[0],
      ],
    );

    res.json(result.rows);
  } catch (error) {
    handleDbError(res, error, 'Get daily statistics');
  }
});

router.get(
  '/api/v1/stats/novels/:novelId',
  validateApiKey,
  validateNovelId,
  async (req, res) => {
    const user_id = (req as AuthenticatedRequest).user.id;
    const { novelId } = req.params;

    try {
      const client = await pool.connect();
      try {
        const [novelInfo, progressStats, sessionStats, bookmarkStats] =
          await Promise.all([
            client.query(
              `
          SELECT n.title, n.author, n.genre, m.status, m.favorite, m.rating,
                 m.started_at, m.completed_at,
                 COALESCE(m.current_read_through, 1) AS current_read_through,
                 COALESCE(m.read_history, '[]'::jsonb) AS read_history
          FROM novels n
          LEFT JOIN user_novel_meta m ON m.novel_id = n.id AND m.user_id = $1
          WHERE n.id = $2
        `,
              [user_id, novelId],
            ),
            client.query(
              `
          SELECT COUNT(*) AS total_snapshots,
                 MIN(created_at) AS first_read,
                 MAX(created_at) AS last_read,
                 MAX(percent) AS max_progress,
                 COUNT(DISTINCT device_id) AS devices_used
          FROM progress_snapshots WHERE user_id = $1 AND novel_id = $2
        `,
              [user_id, novelId],
            ),
            client.query(
              `
          SELECT COUNT(*) AS total_sessions,
                 COALESCE(SUM(time_spent_seconds), 0) AS total_time_seconds,
                 ROUND(AVG(time_spent_seconds), 0) AS avg_session_seconds
          FROM reading_sessions WHERE user_id = $1 AND novel_id = $2 AND end_time IS NOT NULL
        `,
              [user_id, novelId],
            ),
            client.query(
              `
          SELECT COUNT(*) AS total_bookmarks FROM bookmarks WHERE user_id = $1 AND novel_id = $2
        `,
              [user_id, novelId],
            ),
          ]);

        if (novelInfo.rows.length === 0) {
          return res.status(HTTP_NOT_FOUND).json({ error: 'Novel not found' });
        }

        res.json({
          novel: novelInfo.rows[0],
          progress: progressStats.rows[0],
          sessions: sessionStats.rows[0],
          bookmarks: { total: Number(bookmarkStats.rows[0].total_bookmarks) },
        });
      } finally {
        client.release();
      }
    } catch (error) {
      handleDbError(res, error, 'Get novel statistics');
    }
  },
);

export default router;
