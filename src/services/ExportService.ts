import { withTransaction } from '../db/pool.js';

export interface ExportData {
  version: 2;
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

/** Complete, consistent user snapshot. Credentials and browser sessions are excluded. */
export async function buildExport(userId: string): Promise<ExportData> {
  return withTransaction(async (client) => {
    await client.query(
      'SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY',
    );
    const result = {
      version: 2,
      export_date: new Date().toISOString(),
      user_id: userId,
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
      result[key] = (
        await client.query(
          `SELECT to_jsonb(t) AS record FROM ${table} t WHERE user_id = $1`,
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
