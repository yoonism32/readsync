import { withTransaction } from '../db/pool.js';

export interface ExportData {
  version: 2;
  scope?: 'library-backup';
  export_date: string;
  user_id: string;
  novels: unknown[];
  meta: unknown[];
  devices: unknown[];
  progress: unknown[];
  bookmarks: unknown[];
  notes: unknown[];
  categories: unknown[];
  sessions: unknown[];
  settings: unknown[];
  notifications: unknown[];
}

/** Consistent user export, or compact recovery snapshot for internal backups. */
export async function buildExport(
  userId: string,
  scope?: 'library-backup',
): Promise<ExportData> {
  return withTransaction(async (client) => {
    await client.query(
      'SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY',
    );
    const result = {
      version: 2,
      export_date: new Date().toISOString(),
      user_id: userId,
      ...(scope ? { scope } : {}),
    } as ExportData;
    const tables = [
      ['meta', 'user_novel_meta'],
      ['devices', 'devices'],
      ['progress', 'progress_snapshots'],
      ['bookmarks', 'bookmarks'],
      ['notes', 'novel_notes'],
      ['categories', 'novel_categories'],
      ['sessions', 'reading_sessions'],
      ['settings', 'user_settings'],
      ['notifications', 'notifications'],
    ] as const;
    for (const [key, table] of tables) {
      if (
        scope === 'library-backup' &&
        (key === 'sessions' || key === 'notifications')
      ) {
        result[key] = [];
        continue;
      }
      if (scope === 'library-backup' && key === 'progress') {
        // Keep latest AND furthest per device; inactive devices still own progress.
        // LIMIT lookups reuse the existing progress indexes without exporting history.
        result.progress = (
          await client.query(
            `SELECT selected.record
             FROM user_novel_meta m
             JOIN devices d ON d.user_id = m.user_id
             CROSS JOIN LATERAL (
               (SELECT to_jsonb(p) AS record FROM progress_snapshots p
                WHERE p.user_id = m.user_id AND p.novel_id = m.novel_id
                  AND p.device_id = d.id
                  AND p.read_through_num = COALESCE(m.current_read_through, 1)
                  AND p.created_at >= COALESCE(m.progress_reset_at, '-infinity'::timestamptz)
                ORDER BY p.created_at DESC, p.id DESC LIMIT 1)
               UNION
               (SELECT to_jsonb(p) AS record FROM progress_snapshots p
                WHERE p.user_id = m.user_id AND p.novel_id = m.novel_id
                  AND p.device_id = d.id
                  AND p.read_through_num = COALESCE(m.current_read_through, 1)
                  AND p.created_at >= COALESCE(m.progress_reset_at, '-infinity'::timestamptz)
                ORDER BY p.chapter_num DESC, p.percent DESC, p.created_at DESC, p.id DESC LIMIT 1)
             ) selected
             WHERE m.user_id = $1`,
            [userId],
          )
        ).rows.map((row) => row.record);
        continue;
      }
      result[key] = (
        await client.query(
          `SELECT to_jsonb(t) AS record FROM ${table} t WHERE user_id = $1
           ${
             scope === 'library-backup' && key === 'settings'
               ? "AND key NOT IN ('last_backup_at', 'last_backup_attempt_at', 'last_novel_refresh')"
               : ''
           }`,
          [userId],
        )
      ).rows.map((row) => row.record);
    }
    const ids = new Set<string>();
    for (const key of [
      'meta',
      'progress',
      'bookmarks',
      'notes',
      'categories',
      'sessions',
      'notifications',
    ] as const) {
      for (const row of result[key] as { novel_id: string }[])
        ids.add(row.novel_id);
    }
    result.novels = (
      await client.query(
        'SELECT to_jsonb(n) AS record FROM novels n WHERE id = ANY($1::text[]) ORDER BY title',
        [[...ids]],
      )
    ).rows.map((row) => row.record);
    return result;
  });
}
