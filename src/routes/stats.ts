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

// The hourly card's hover needs reading *context*, not just a duration, so
// this endpoint returns per-hour novel attribution alongside the totals.
// Two source tables, deliberately: reading_sessions carries the time but has
// no chapter column (src/db/schema.ts), so the chapter range has to come from
// progress_snapshots. That means the two figures sit on different clocks —
// session start_time vs. snapshot created_at — and can disagree at an hour
// boundary. Correct enough for a hover card; do not present them as one
// measurement.
const HOUR_NOVELS_LIMIT = 3;

router.get('/api/v1/stats/breakdown', validateApiKey, async (req, res) => {
  const user_id = (req as AuthenticatedRequest).user.id;
  const weekOnly = req.query.window === 'week';

  // date_trunc('week') is Monday-based in Postgres, matching the weekday card.
  const sessionWindow = weekOnly
    ? "AND start_time >= date_trunc('week', now())"
    : '';
  const snapshotWindow = weekOnly
    ? "AND created_at >= date_trunc('week', now())"
    : '';

  try {
    const [hourly, weekday, byDevice, hourNovels, hourChapters] =
      await Promise.all([
        pool.query(
          `SELECT EXTRACT(HOUR FROM start_time)::int AS hour,
                COUNT(*) AS sessions,
                COALESCE(SUM(time_spent_seconds), 0) AS seconds
         FROM reading_sessions
         WHERE user_id = $1 AND end_time IS NOT NULL ${sessionWindow}
         GROUP BY hour`,
          [user_id],
        ),
        pool.query(
          `SELECT EXTRACT(DOW FROM start_time)::int AS weekday,
                COUNT(*) AS sessions,
                COALESCE(SUM(time_spent_seconds), 0) AS seconds
         FROM reading_sessions
         WHERE user_id = $1 AND end_time IS NOT NULL ${sessionWindow}
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
           ${sessionWindow ? sessionWindow.replace('start_time', 'rs.start_time') : ''}
         GROUP BY d.id, d.device_label
         ORDER BY seconds DESC`,
          [user_id],
        ),
        // Top novels per hour, by time. rank() keeps this one round-trip
        // instead of 24.
        pool.query(
          `SELECT hour, novel_id, title, seconds
         FROM (
           SELECT EXTRACT(HOUR FROM rs.start_time)::int AS hour,
                  n.id AS novel_id,
                  n.title,
                  COALESCE(SUM(rs.time_spent_seconds), 0) AS seconds,
                  ROW_NUMBER() OVER (
                    PARTITION BY EXTRACT(HOUR FROM rs.start_time)::int
                    ORDER BY COALESCE(SUM(rs.time_spent_seconds), 0) DESC, n.title
                  ) AS rn
           FROM reading_sessions rs
           JOIN novels n ON n.id = rs.novel_id
           WHERE rs.user_id = $1 AND rs.end_time IS NOT NULL
             ${sessionWindow ? sessionWindow.replace('start_time', 'rs.start_time') : ''}
           GROUP BY hour, n.id, n.title
         ) ranked
         WHERE rn <= $2`,
          [user_id, HOUR_NOVELS_LIMIT],
        ),
        // Chapter span per (hour, novel) — the "Ch. 18–42" half of the hover.
        pool.query(
          `SELECT EXTRACT(HOUR FROM created_at)::int AS hour,
                novel_id,
                MIN(chapter_num) AS min_chapter,
                MAX(chapter_num) AS max_chapter
         FROM progress_snapshots
         WHERE user_id = $1 AND chapter_num IS NOT NULL ${snapshotWindow}
         GROUP BY hour, novel_id`,
          [user_id],
        ),
      ]);

    const chapterSpans = new Map<string, { min: number; max: number }>();
    for (const r of hourChapters.rows) {
      chapterSpans.set(`${r.hour}:${r.novel_id}`, {
        min: Number(r.min_chapter),
        max: Number(r.max_chapter),
      });
    }

    const novelsByHour = new Map<
      number,
      {
        novel_id: string;
        title: string;
        seconds: number;
        min_chapter: number | null;
        max_chapter: number | null;
      }[]
    >();
    for (const r of hourNovels.rows) {
      const hour = Number(r.hour);
      const span = chapterSpans.get(`${hour}:${r.novel_id}`);
      const list = novelsByHour.get(hour) ?? [];
      list.push({
        novel_id: r.novel_id as string,
        title: r.title as string,
        seconds: Number(r.seconds),
        min_chapter: span?.min ?? null,
        max_chapter: span?.max ?? null,
      });
      novelsByHour.set(hour, list);
    }

    const by_hour = fillBuckets(hourly.rows, 24, (r) => r.hour).map((b) => ({
      hour: b.index,
      sessions: b.sessions,
      seconds: b.seconds,
      novels: novelsByHour.get(b.index) ?? [],
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

// GET /api/v1/stats/pace — per-novel reading pace against the library median.
//
// Built on progress_snapshots.seconds_on_page, which was written on every sync
// and read by nothing until now.
//
// Two things this has to get right:
//  1. seconds_on_page is CUMULATIVE time since page load
//     (userscript ProgressSync.ts), not a per-ping delta — every scroll ping
//     re-reports a larger total for the same chapter. So the per-chapter dwell
//     is MAX over the pings, never SUM, which would multiply a chapter's time
//     by its ping count.
//  2. It's wall-clock, so an idle tab inflates it without bound — production
//     holds a single 154,757s (43 hour) reading. Hence the clamp below.
//
// ponytail: fixed clamp rather than a per-novel percentile trim. 5s drops
// bounce-throughs, 1800s drops abandoned tabs; together they keep 93% of
// production rows (129,676 of 139,065). Swap in a percentile trim only if
// these numbers start looking wrong.
const PACE_MIN_SECONDS = 5;
const PACE_MAX_SECONDS = 1800;
/** Below this, a novel's median is noise rather than a reading habit. */
const PACE_MIN_CHAPTERS = 5;
const PACE_LIST_SIZE = 5;

router.get('/api/v1/stats/pace', validateApiKey, async (req, res) => {
  const user_id = (req as AuthenticatedRequest).user.id;

  try {
    const result = await pool.query(
      `WITH per_chapter AS (
         SELECT novel_id, chapter_num, read_through_num,
                MAX(seconds_on_page) AS dwell
         FROM progress_snapshots
         WHERE user_id = $1 AND chapter_num IS NOT NULL
         GROUP BY novel_id, chapter_num, read_through_num
       ),
       clamped AS (
         SELECT * FROM per_chapter WHERE dwell BETWEEN $2 AND $3
       ),
       baseline AS (
         SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY dwell) AS median
         FROM clamped
       )
       SELECT n.id AS novel_id, n.title,
              COUNT(*) AS chapters,
              percentile_cont(0.5) WITHIN GROUP (ORDER BY c.dwell) AS median_seconds,
              (SELECT median FROM baseline) AS library_median
       FROM clamped c
       JOIN novels n ON n.id = c.novel_id
       GROUP BY n.id, n.title
       HAVING COUNT(*) >= $4
       ORDER BY median_seconds ASC`,
      [user_id, PACE_MIN_SECONDS, PACE_MAX_SECONDS, PACE_MIN_CHAPTERS],
    );

    const libraryMedian = Number(result.rows[0]?.library_median ?? 0);

    const novels = result.rows.map((r) => ({
      novel_id: r.novel_id as string,
      title: r.title as string,
      chapters: Number(r.chapters),
      median_seconds: Math.round(Number(r.median_seconds)),
      ratio:
        libraryMedian > 0
          ? Number((Number(r.median_seconds) / libraryMedian).toFixed(2))
          : null,
    }));

    const half = Math.min(PACE_LIST_SIZE, Math.floor(novels.length / 2));

    res.json({
      library_median_seconds: Math.round(libraryMedian),
      qualifying_novels: novels.length,
      // Already sorted ascending by the query, so fastest is the head and
      // slowest is the tail reversed. Halving keeps the two lists disjoint
      // when few novels qualify — otherwise the same novel appears as both
      // the fastest and the slowest read, which reads as a bug.
      fastest: novels.slice(0, half),
      slowest: half > 0 ? novels.slice(-half).reverse() : [],
    });
  } catch (error) {
    handleDbError(res, error, 'Get reading pace');
  }
});

// GET /api/v1/stats/rating-audit — where your ratings and your behaviour
// disagree.
//
// Reality check that shapes this endpoint: only 2 of 149 novels carry a
// rating today, so the two audit buckets are empty for most users most of the
// time. Rather than ship a card that is permanently blank, this also returns
// the most-read *unrated* novels, so the UI can turn its own empty state into
// the on-ramp that makes the feature work later.
const RATING_LOVED = 4.5;
const RATING_LOW = 2.5;
const RATING_STALE_DAYS = 60;
const RATING_ACTIVE_DAYS = 14;
const RATING_LIST_SIZE = 5;

router.get('/api/v1/stats/rating-audit', validateApiKey, async (req, res) => {
  const user_id = (req as AuthenticatedRequest).user.id;

  try {
    const result = await pool.query(
      `WITH activity AS (
         SELECT novel_id,
                MAX(created_at) AS last_read,
                COUNT(DISTINCT chapter_num) AS chapters_read
         FROM progress_snapshots
         WHERE user_id = $1
         GROUP BY novel_id
       )
       SELECT n.id AS novel_id, n.title, m.rating,
              a.last_read, COALESCE(a.chapters_read, 0) AS chapters_read,
              EXTRACT(DAY FROM (now() - a.last_read))::int AS days_since
       FROM novels n
       JOIN user_novel_meta m ON m.novel_id = n.id AND m.user_id = $1
       LEFT JOIN activity a ON a.novel_id = n.id`,
      [user_id],
    );

    type Row = {
      novel_id: string;
      title: string;
      rating: string | null;
      last_read: Date | null;
      chapters_read: string;
      days_since: number | null;
    };

    const rows = (result.rows as Row[]).map((r) => ({
      novel_id: r.novel_id,
      title: r.title,
      rating: r.rating === null ? null : Number(r.rating),
      chapters_read: Number(r.chapters_read),
      days_since: r.days_since,
      last_read: r.last_read ? r.last_read.toISOString() : null,
    }));

    // Rated highly, then dropped — the "you said you loved this" pile.
    const loved_but_stale = rows
      .filter(
        (r) =>
          r.rating !== null &&
          r.rating >= RATING_LOVED &&
          (r.days_since === null || r.days_since >= RATING_STALE_DAYS),
      )
      .sort((a, b) => (b.days_since ?? 1e9) - (a.days_since ?? 1e9))
      .slice(0, RATING_LIST_SIZE);

    // Rated poorly, still being read — the "why are you still here" pile.
    const low_but_active = rows
      .filter(
        (r) =>
          r.rating !== null &&
          r.rating <= RATING_LOW &&
          r.days_since !== null &&
          r.days_since <= RATING_ACTIVE_DAYS,
      )
      .sort((a, b) => b.chapters_read - a.chapters_read)
      .slice(0, RATING_LIST_SIZE);

    // The on-ramp: novels you've clearly invested in but never rated.
    const unrated_candidates = rows
      .filter((r) => r.rating === null && r.chapters_read > 0)
      .sort((a, b) => b.chapters_read - a.chapters_read)
      .slice(0, RATING_LIST_SIZE);

    res.json({
      rated_count: rows.filter((r) => r.rating !== null).length,
      total_count: rows.length,
      loved_but_stale,
      low_but_active,
      unrated_candidates,
    });
  } catch (error) {
    handleDbError(res, error, 'Get rating audit');
  }
});

// GET /api/v1/stats/on-this-day — what you were reading at past milestones.
//
// Anchored on 1/3/6/12/24-month lookbacks, but matched over a ±3 day window
// rather than the exact date: reading isn't daily, and an exact-date match
// hit only 1 of 4 anchors against real production history. The response
// carries the *actual* date found so the UI can say "a year ago" and show the
// real day underneath rather than implying an exact anniversary.
//
// Range predicates (not created_at::date = X) so the created_at index is
// usable. CURRENT_DATE is the server's date, i.e. UTC on Render — close
// enough for a nostalgia card, not for anything that has to be exact.
const ON_THIS_DAY_WINDOW_DAYS = 3;
const ON_THIS_DAY_PER_ANCHOR = 2;

router.get('/api/v1/stats/on-this-day', validateApiKey, async (req, res) => {
  const user_id = (req as AuthenticatedRequest).user.id;

  try {
    const result = await pool.query(
      `WITH bounds AS (
         SELECT m AS months, (CURRENT_DATE - (m || ' months')::interval)::date AS anchor
         FROM (VALUES (1),(3),(6),(12),(24)) AS o(m)
       )
       -- to_char, not a JS Date: node-postgres hands back DATE as a local-
       -- midnight Date, and toISOString() on that shifts the day backwards for
       -- any negative UTC offset.
       SELECT months, to_char(day, 'YYYY-MM-DD') AS day, novel_id, title,
              min_chapter, max_chapter, snapshots
       FROM (
         SELECT b.months, b.anchor, ps.created_at::date AS day,
                n.id AS novel_id, n.title,
                MIN(ps.chapter_num) AS min_chapter,
                MAX(ps.chapter_num) AS max_chapter,
                COUNT(*) AS snapshots,
                ROW_NUMBER() OVER (
                  PARTITION BY b.months
                  ORDER BY abs(ps.created_at::date - b.anchor), COUNT(*) DESC, n.title
                ) AS rn
         FROM bounds b
         JOIN progress_snapshots ps
           -- $2::int is explicit: without the cast Postgres cannot infer the
           -- parameter's type here and fails with "cannot cast type integer
           -- to timestamp with time zone".
           ON ps.created_at >= (b.anchor - $2::int)::timestamptz
          AND ps.created_at <  (b.anchor + $2::int + 1)::timestamptz
         JOIN novels n ON n.id = ps.novel_id
         WHERE ps.user_id = $1 AND ps.chapter_num IS NOT NULL
         GROUP BY b.months, b.anchor, ps.created_at::date, n.id, n.title
       ) ranked
       WHERE rn <= $3
       ORDER BY months, rn`,
      [user_id, ON_THIS_DAY_WINDOW_DAYS, ON_THIS_DAY_PER_ANCHOR],
    );

    const entries = result.rows.map((r) => ({
      months_ago: Number(r.months),
      date: r.day as string,
      novel_id: r.novel_id as string,
      title: r.title as string,
      min_chapter: Number(r.min_chapter),
      max_chapter: Number(r.max_chapter),
      snapshots: Number(r.snapshots),
    }));

    res.json({ entries });
  } catch (error) {
    handleDbError(res, error, 'Get on-this-day');
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
        const [
          novelInfo,
          progressStats,
          sessionStats,
          bookmarkStats,
          timeline,
        ] = await Promise.all([
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
          // Chapter-over-time series for the reading timeline sparkline.
          // One row per chapter (its first sighting), not per snapshot —
          // a chapter read across 40 scroll pings is one point, not 40.
          // This endpoint is page-scoped, not list-backing, so adding a
          // fifth query here doesn't repeat the egress-incident mistake.
          client.query(
            `
          SELECT chapter_num, MIN(created_at) AS first_read
          FROM progress_snapshots
          WHERE user_id = $1 AND novel_id = $2 AND chapter_num IS NOT NULL
          GROUP BY chapter_num
          ORDER BY first_read
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
          timeline: timeline.rows.map((r) => ({
            chapter_num: Number(r.chapter_num),
            first_read: (r.first_read as Date).toISOString(),
          })),
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
