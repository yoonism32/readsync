import { Router } from 'express';
import pool from '../db/pool.js';
import { validateApiKey } from '../middleware/auth.js';
import { handleDbError } from '../middleware/errorHandler.js';
import {
  BACKUP_MIN_AGE_HOURS,
  getBackupInventory,
} from '../services/BackupService.js';
import type { AuthenticatedRequest } from '../types/index.js';

const router = Router();

function timestamp(value: string | undefined): string | null {
  const time = value ? Date.parse(value) : NaN;
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

// Personal report, separate from the public infrastructure health probe.
router.get('/api/v1/status', validateApiKey, async (req, res) => {
  res.setHeader('Cache-Control', 'private, no-store');
  const userId = (req as AuthenticatedRequest).user.id;
  try {
    const [library, records, settings, inventory] = await Promise.all([
      pool.query(
        `
        WITH activity AS (
          SELECT novel_id, MAX(created_at) AS last_read_at
          FROM progress_snapshots
          WHERE user_id = $1 AND device_id NOT LIKE 'manual:%'
          GROUP BY novel_id
        ), library AS (
          SELECT n.id AS novel_id, n.title,
                 COALESCE(m.status, 'reading') AS status,
                 COALESCE(m.last_read_at, a.last_read_at) AS last_read_at,
                 COALESCE(m.current_read_through, 1) AS read_through,
                 p.chapter_num AS chapter, p.percent AS chapter_percent,
                 n.latest_chapter_num AS latest_published_chapter,
                 n.chapters_updated_at AS metadata_updated_at,
                 CASE WHEN p.chapter_num IS NULL OR n.latest_chapter_num IS NULL
                      THEN NULL ELSE GREATEST(n.latest_chapter_num - p.chapter_num, 0) END AS chapters_behind
          FROM novels n
          LEFT JOIN user_novel_meta m ON m.novel_id = n.id AND m.user_id = $1
          LEFT JOIN activity a ON a.novel_id = n.id
          LEFT JOIN LATERAL (
            SELECT chapter_num, percent FROM progress_snapshots
            WHERE user_id = $1 AND novel_id = n.id
              AND read_through_num = COALESCE(m.current_read_through, 1)
              AND created_at >= COALESCE(m.progress_reset_at, '-infinity'::timestamptz)
            ORDER BY chapter_num DESC, percent DESC, created_at DESC, id DESC LIMIT 1
          ) p ON TRUE
          WHERE (m.user_id IS NOT NULL OR a.novel_id IS NOT NULL)
            AND COALESCE(m.status, 'reading') <> 'removed'
        )
        SELECT
          (SELECT COUNT(*)::int FROM library) AS total_novels,
          (SELECT jsonb_object_agg(status, total) FROM (
             SELECT status, COUNT(*)::int AS total FROM library GROUP BY status
           ) counts) AS by_status,
          (SELECT COUNT(*)::int FROM library WHERE chapters_behind > 0) AS novels_behind,
          (SELECT COALESCE(SUM(chapters_behind), 0)::int FROM library) AS chapters_behind,
          (SELECT MAX(metadata_updated_at) FROM library) AS last_metadata_update_at,
          (SELECT COALESCE(jsonb_agg(recent ORDER BY last_read_at DESC, novel_id), '[]'::jsonb)
           FROM (SELECT * FROM library WHERE last_read_at IS NOT NULL
                 ORDER BY last_read_at DESC, novel_id LIMIT 8) recent) AS recent_reading
      `,
        [userId],
      ),
      pool.query(
        `
        SELECT
          (SELECT COUNT(*)::int FROM progress_snapshots WHERE user_id = $1) AS progress_snapshots,
          (SELECT MAX(created_at) FROM progress_snapshots WHERE user_id = $1 AND device_id NOT LIKE 'manual:%') AS last_sync_at,
          (SELECT COUNT(*)::int FROM novel_notes WHERE user_id = $1) AS notes,
          (SELECT COUNT(*)::int FROM bookmarks WHERE user_id = $1) AS bookmarks,
          (SELECT COUNT(*)::int FROM reading_sessions WHERE user_id = $1) AS reading_sessions,
          (SELECT COALESCE(SUM(time_spent_seconds), 0)::bigint FROM reading_sessions WHERE user_id = $1 AND end_time IS NOT NULL) AS reading_seconds,
          (SELECT COUNT(*)::int FROM devices WHERE user_id = $1 AND active = TRUE AND id NOT LIKE 'manual:%') AS active_devices
      `,
        [userId],
      ),
      pool.query<{ key: string; value: string }>(
        `
        SELECT key, value FROM user_settings WHERE user_id = $1
        AND key = ANY($2::text[])
      `,
        [
          userId,
          [
            'last_novel_refresh',
            'refresh_interval_hours',
            'last_backup_at',
            'last_backup_attempt_at',
          ],
        ],
      ),
      getBackupInventory(userId),
    ]);
    const now = new Date();
    const stored = new Map(settings.rows.map((row) => [row.key, row.value]));
    const hours = Number(stored.get('refresh_interval_hours'));
    const intervalHours = Number.isFinite(hours) && hours > 0 ? hours : 24;
    const lastRefresh = timestamp(stored.get('last_novel_refresh'));
    const dueAt = lastRefresh
      ? new Date(
          Date.parse(lastRefresh) + intervalHours * 3_600_000,
        ).toISOString()
      : null;
    const lastBackup = timestamp(stored.get('last_backup_at'));
    const lastAttempt = timestamp(stored.get('last_backup_attempt_at'));
    const backupGate = lastAttempt ?? lastBackup;
    const eligibleAt = backupGate
      ? new Date(
          Date.parse(backupGate) + BACKUP_MIN_AGE_HOURS * 3_600_000,
        ).toISOString()
      : null;
    const row = library.rows[0];
    const counts = records.rows[0];
    res.json({
      generated_at: now.toISOString(),
      report_status:
        inventory.status === 'unavailable' ? 'partial' : 'complete',
      service: { database: 'ok', uptime_seconds: Math.floor(process.uptime()) },
      library: {
        total_novels: row.total_novels,
        by_status: row.by_status ?? {},
        novels_behind: row.novels_behind,
        chapters_behind: row.chapters_behind,
      },
      reading: {
        recent: row.recent_reading,
        last_sync_at: counts.last_sync_at,
        completed_session_seconds: Number(counts.reading_seconds),
        active_devices: counts.active_devices,
      },
      refresh: {
        last_refresh_at: lastRefresh,
        interval_hours: intervalHours,
        due_at: dueAt,
        state: !dueAt
          ? 'never_recorded'
          : Date.parse(dueAt) <= now.getTime()
            ? 'due'
            : 'not_due',
        automatic: false,
        last_metadata_update_at: row.last_metadata_update_at,
      },
      storage: {
        scope: 'your_account',
        progress_snapshots: counts.progress_snapshots,
        notes: counts.notes,
        bookmarks: counts.bookmarks,
        reading_sessions: counts.reading_sessions,
        backup_bytes:
          inventory.status === 'available'
            ? inventory.files.reduce((sum, file) => sum + file.size, 0)
            : null,
        backup_file_count:
          inventory.status === 'available' ? inventory.files.length : null,
        backup_inventory_truncated: inventory.truncated,
      },
      backups: {
        storage_status: inventory.status,
        last_success_at: lastBackup,
        last_attempt_at: lastAttempt,
        next_eligible_at:
          inventory.status === 'not_configured' ? null : eligibleAt,
        schedule_note:
          'When configured, checked every 6 hours while the server runs; eligibility is not an exact run time.',
      },
    });
  } catch (error) {
    handleDbError(res, error, 'Get status report');
  }
});

export default router;
