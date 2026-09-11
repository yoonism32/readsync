import type { PoolClient } from 'pg';
import type { NovelStatus } from '../types/index.js';

/** Shared single/bulk transition, including completion history and progress. */
export async function setNovelStatus(
  client: PoolClient,
  userId: string,
  novelId: string,
  status: NovelStatus,
) {
  await client.query(
    `INSERT INTO user_novel_meta (user_id, novel_id, status, updated_at) VALUES ($1, $2, 'reading', CURRENT_TIMESTAMP) ON CONFLICT (user_id, novel_id) DO NOTHING`,
    [userId, novelId],
  );

  const updateResult = await client.query(
    `UPDATE user_novel_meta SET status = $3, updated_at = CURRENT_TIMESTAMP,
            completed_at = CASE WHEN $3 = 'completed' THEN COALESCE(completed_at, CURRENT_TIMESTAMP) WHEN $3 != 'completed' THEN NULL ELSE completed_at END
          WHERE user_id = $1 AND novel_id = $2 RETURNING *`,
    [userId, novelId, status],
  );

  if (updateResult.rows.length === 0)
    throw new Error('Novel not found for user');

  if (status === 'completed') {
    const meta = updateResult.rows[0];
    const currentRT = meta.current_read_through || 1;
    // Furthest-progressed snapshot, not most-recently-written — a
    // synthetic completion row built from whichever device wrote last
    // could archive and re-insert a *lower* chapter than the reader
    // actually reached (same ordering bug as ExportService.ts).
    const latestProgress = await client.query<{
      chapter_num: number;
      chapter_token: string;
      url: string;
      novel_id: string;
      percent: string;
    }>(
      "SELECT chapter_num, chapter_token, url, novel_id, percent FROM progress_snapshots WHERE user_id = $1 AND novel_id = $2 AND read_through_num = $3 AND created_at >= COALESCE((SELECT progress_reset_at FROM user_novel_meta WHERE user_id = $1 AND novel_id = $2), '-infinity'::timestamptz) ORDER BY chapter_num DESC, percent DESC, created_at DESC LIMIT 1",
      [userId, novelId, currentRT],
    );
    const archiveEntry = {
      read_through: currentRT,
      started_at: meta.started_at,
      completed_at: new Date().toISOString(),
      max_chapter: latestProgress.rows[0]?.chapter_num ?? 0,
      max_percent: parseFloat(latestProgress.rows[0]?.percent ?? '0'),
    };
    await client.query(
      `
            UPDATE user_novel_meta SET read_history = CASE
              WHEN NOT EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(read_history, '[]'::jsonb)) elem WHERE (elem->>'read_through')::int = $3)
              THEN COALESCE(read_history, '[]'::jsonb) || $4::jsonb ELSE read_history END
            WHERE user_id = $1 AND novel_id = $2
          `,
      [userId, novelId, currentRT, JSON.stringify(archiveEntry)],
    );

    if (latestProgress.rows.length > 0) {
      const lp = latestProgress.rows[0];
      await client.query(
        `INSERT INTO devices (id, user_id, device_label, device_type)
               VALUES ($1, $2, 'Completion', 'unknown') ON CONFLICT (id) DO NOTHING`,
        [`system:${userId}`, userId],
      );
      await client.query(
        'INSERT INTO progress_snapshots (user_id, device_id, novel_id, chapter_token, chapter_num, percent, url, seconds_on_page, read_through_num) VALUES ($1, $2, $3, $4, $5, 100, $6, 0, $7)',
        [
          userId,
          `system:${userId}`,
          lp.novel_id,
          lp.chapter_token,
          lp.chapter_num,
          lp.url,
          currentRT,
        ],
      );
    }
  }

  return updateResult.rows[0];
}
