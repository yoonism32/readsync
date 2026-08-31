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
import { fillBuckets } from '../services/StatsBreakdown.js';
import { computeVelocityTrend } from '../services/StatsVelocity.js';
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

      const totalTracked = Object.values(statusMap).reduce((a, b) => a + b, 0);
      const completion_rate =
        totalTracked > 0
          ? Math.round(((statusMap.completed ?? 0) / totalTracked) * 1000) / 10
          : 0;

      res.json({
        total_novels: Number(totalNovels.rows[0]?.total ?? 0),
        novels_by_status: {
          reading: statusMap.reading ?? 0,
          completed: statusMap.completed ?? 0,
          'on-hold': statusMap['on-hold'] ?? 0,
          dropped: statusMap.dropped ?? 0,
          'plan-to-read': statusMap['plan-to-read'] ?? 0,
        },
        completion_rate,
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

const GENRE_TOP_N = 12;

/**
 * Genre distribution — scoped to novels the user actually tracks (has a
 * user_novel_meta row), same 'removed' exclusion as /stats/summary's
 * novels_by_status. novels.genre stores a comma-separated tag string (e.g.
 * "FANTASY,ACTION,ADVENTURE,HAREM"), not one value per novel, so this
 * unnests it — a novel with 5 tags counts toward 5 buckets, and percent is
 * "% of your tracked novels carrying this tag" (columns don't sum to 100).
 * Long tails beyond the top N fold into "Other" so the panel stays legible.
 */
router.get('/api/v1/stats/genres', validateApiKey, async (req, res) => {
  const user_id = (req as AuthenticatedRequest).user.id;

  try {
    const [tagCounts, totalTracked] = await Promise.all([
      pool.query(
        `WITH tags AS (
           SELECT m.novel_id,
                  TRIM(UNNEST(STRING_TO_ARRAY(COALESCE(n.genre, 'Unknown'), ','))) AS tag
           FROM user_novel_meta m
           JOIN novels n ON n.id = m.novel_id
           WHERE m.user_id = $1 AND m.status <> 'removed'
         )
         SELECT tag AS genre, COUNT(DISTINCT novel_id) AS count
         FROM tags
         WHERE tag <> ''
         GROUP BY tag
         ORDER BY count DESC`,
        [user_id],
      ),
      pool.query(
        `SELECT COUNT(*) AS total FROM user_novel_meta WHERE user_id = $1 AND status <> 'removed'`,
        [user_id],
      ),
    ]);

    const total = Number(totalTracked.rows[0]?.total ?? 0);
    const toPercent = (count: number): number =>
      total > 0 ? Math.round((count / total) * 1000) / 10 : 0;

    const top = tagCounts.rows.slice(0, GENRE_TOP_N);
    const rest = tagCounts.rows.slice(GENRE_TOP_N);
    const otherCount = rest.reduce((sum, r) => sum + Number(r.count), 0);

    const genres = top.map((r) => ({
      genre: r.genre as string,
      count: Number(r.count),
      percent: toPercent(Number(r.count)),
    }));

    if (otherCount > 0) {
      genres.push({
        genre: `Other (${rest.length})`,
        count: otherCount,
        percent: toPercent(otherCount),
      });
    }

    res.json(genres);
  } catch (error) {
    handleDbError(res, error, 'Get genre breakdown');
  }
});

/**
 * Reading velocity — trailing 7-day vs. prior 7-day average chapters/day,
 * reusing the daily-bucket query shape from /stats/daily. Trend math lives
 * in StatsVelocity.ts so it's unit-testable independent of the DB.
 */
router.get('/api/v1/stats/velocity', validateApiKey, async (req, res) => {
  const user_id = (req as AuthenticatedRequest).user.id;
  const toDate = new Date();
  const fromDate = new Date(Date.now() - 13 * MS_PER_DAY);

  try {
    const result = await pool.query(
      `
      WITH date_range AS (
        SELECT generate_series($2::date, $3::date, '1 day'::interval)::date AS date
      ),
      daily AS (
        SELECT
          DATE(created_at) AS date,
          COUNT(DISTINCT (novel_id, chapter_num)) AS chapters_read
        FROM progress_snapshots
        WHERE user_id = $1
          AND created_at >= $2
          AND created_at <= $3 + interval '1 day'
        GROUP BY DATE(created_at)
      )
      SELECT dr.date, COALESCE(d.chapters_read, 0) AS chapters_read
      FROM date_range dr
      LEFT JOIN daily d ON dr.date = d.date
      ORDER BY dr.date ASC
      `,
      [
        user_id,
        fromDate.toISOString().split('T')[0],
        toDate.toISOString().split('T')[0],
      ],
    );

    res.json(computeVelocityTrend(result.rows));
  } catch (error) {
    handleDbError(res, error, 'Get reading velocity');
  }
});

const WEEKDAY_LABELS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

router.get('/api/v1/stats/breakdown', validateApiKey, async (req, res) => {
  const user_id = (req as AuthenticatedRequest).user.id;

  try {
    const [hourly, weekday, byDevice] = await Promise.all([
      pool.query(
        `SELECT EXTRACT(HOUR FROM start_time)::int AS hour,
                COUNT(*) AS sessions,
                COALESCE(SUM(time_spent_seconds), 0) AS seconds
         FROM reading_sessions
         WHERE user_id = $1 AND end_time IS NOT NULL
         GROUP BY hour`,
        [user_id],
      ),
      pool.query(
        `SELECT EXTRACT(DOW FROM start_time)::int AS weekday,
                COUNT(*) AS sessions,
                COALESCE(SUM(time_spent_seconds), 0) AS seconds
         FROM reading_sessions
         WHERE user_id = $1 AND end_time IS NOT NULL
         GROUP BY weekday`,
        [user_id],
      ),
      pool.query(
        `SELECT d.id AS device_id, d.device_label,
                COUNT(rs.*) AS sessions,
                COALESCE(SUM(rs.time_spent_seconds), 0) AS seconds
         FROM reading_sessions rs
         JOIN devices d ON d.id = rs.device_id
         WHERE rs.user_id = $1 AND rs.end_time IS NOT NULL
         GROUP BY d.id, d.device_label
         ORDER BY seconds DESC`,
        [user_id],
      ),
    ]);

    const by_hour = fillBuckets(hourly.rows, 24, (r) => r.hour).map((b) => ({
      hour: b.index,
      sessions: b.sessions,
      seconds: b.seconds,
    }));

    const by_weekday = fillBuckets(weekday.rows, 7, (r) => r.weekday).map(
      (b) => ({
        weekday: b.index,
        label: WEEKDAY_LABELS[b.index],
        sessions: b.sessions,
        seconds: b.seconds,
      }),
    );

    const by_device = byDevice.rows.map((r) => ({
      device_id: r.device_id as string,
      device_label: r.device_label as string,
      sessions: Number(r.sessions),
      seconds: Number(r.seconds),
    }));

    res.json({ by_hour, by_weekday, by_device });
  } catch (error) {
    handleDbError(res, error, 'Get statistics breakdown');
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
