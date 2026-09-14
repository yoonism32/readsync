import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pool from '../../src/db/pool.js';
import { runMigrations } from '../../src/db/migrate.js';
import { buildExport } from '../../src/services/ExportService.js';
import { restoreExport, validateImport } from '../../src/services/ImportService.js';
import { getLatestStates } from '../../src/services/NovelService.js';

describe.skipIf(!process.env.READSYNC_TEST_DATABASE_URL)('compact backup recovery', () => {
  const source = 'compact-source';
  const target = 'compact-target';
  const novel = 'novelbin:compact-test';
  const unread = 'novelbin:compact-unread';

  beforeAll(async () => {
    await runMigrations();
    await pool.query(`INSERT INTO users (id, display_name, api_key)
      VALUES ($1, 'Source', 'compact-source-key'), ($2, 'Target', 'compact-target-key')`, [source, target]);
    await pool.query(`INSERT INTO novels (id, title) VALUES ($1, 'Reading'), ($2, 'Unread')`, [novel, unread]);
    await pool.query(`INSERT INTO devices (id, user_id, device_label, active)
      VALUES ('compact-a', $1, 'A', true), ('compact-b', $1, 'B', false)`, [source]);
    await pool.query(`INSERT INTO user_novel_meta
      (user_id, novel_id, current_read_through, progress_reset_at, favorite, read_history, last_read_at)
      VALUES ($1, $2, 2, '2026-01-02', true, '[{"read_through":1,"max_chapter":900}]', '2026-01-03'),
             ($1, $3, 1, NULL, false, '[]', NULL)`, [source, novel, unread]);
    // Old read-through and pre-reset progress must never reappear on restore.
    await pool.query(`INSERT INTO progress_snapshots
      (user_id, novel_id, device_id, chapter_num, percent, read_through_num, created_at)
      VALUES ($1, $2, 'compact-a', 900, 100, 1, '2026-01-03'),
             ($1, $2, 'compact-a', 800, 100, 2, '2026-01-01'),
             ($1, $2, 'compact-a', 50, 75, 2, '2026-01-03'),
             ($1, $2, 'compact-a', 40, 25, 2, '2026-01-04'),
             ($1, $2, 'compact-b', 60, 50, 2, '2026-01-03')`, [source, novel]);
    await pool.query(`INSERT INTO progress_snapshots
      (user_id, novel_id, device_id, chapter_num, percent, read_through_num, created_at)
      SELECT $1, $2, 'compact-a', 10, 10, 2,
        '2026-01-02'::timestamptz + n * interval '1 second'
      FROM generate_series(1, 1000) n`, [source, novel]);
    await pool.query(`INSERT INTO novel_notes (user_id, novel_id, note_text) VALUES ($1, $2, 'Keep note')`, [source, novel]);
    await pool.query(`INSERT INTO novel_categories (user_id, novel_id, category) VALUES ($1, $2, 'Keep tag')`, [source, novel]);
    await pool.query(`INSERT INTO bookmarks (user_id, novel_id, chapter_url, percent)
      VALUES ($1, $2, 'https://novelarrow.com/novel/compact-test/chapter-10', 25)`, [source, novel]);
    await pool.query(`INSERT INTO reading_sessions (user_id, novel_id, device_id)
      VALUES ($1, $2, 'compact-a')`, [source, novel]);
    await pool.query(`INSERT INTO notifications (user_id, novel_id, type, message)
      VALUES ($1, $2, 'new_chapters', 'History only')`, [source, novel]);
    await pool.query(`INSERT INTO user_settings (user_id, key, value)
      VALUES ($1, 'refresh_interval_hours', '24'), ($1, 'last_backup_at', '2026-01-01'),
             ($1, 'last_backup_attempt_at', '2026-01-01'), ($1, 'last_novel_refresh', '2026-01-01')`, [source]);
  });

  afterAll(async () => {
    await pool.query('DELETE FROM users WHERE id = ANY($1)', [[source, target]]);
    await pool.query('DELETE FROM novels WHERE id = ANY($1)', [[novel, unread]]);
    await pool.end();
  });

  it('keeps bounded positions and personal data, leaves full export intact, and restores twice safely', async () => {
    const full = await buildExport(source);
    const backup = await buildExport(source, 'library-backup');
    validateImport(backup);
    expect(backup.scope).toBe('library-backup');
    expect(full.scope).toBeUndefined();
    expect(full.progress).toHaveLength(1005);
    expect(full.sessions).toHaveLength(1);
    expect(full.notifications).toHaveLength(1);
    expect(backup.progress).toHaveLength(3);
    expect(backup.progress).toEqual(expect.arrayContaining([
      expect.objectContaining({ device_id: 'compact-a', chapter_num: 50 }),
      expect.objectContaining({ device_id: 'compact-a', chapter_num: 40 }),
      expect.objectContaining({ device_id: 'compact-b', chapter_num: 60 }),
    ]));
    expect(backup.novels).toHaveLength(2);
    expect(backup.sessions).toEqual([]);
    expect(backup.notifications).toEqual([]);
    expect(backup.settings).toEqual([expect.objectContaining({ key: 'refresh_interval_hours' })]);
    await restoreExport(backup, target);
    await restoreExport(backup, target);
    const restored = await buildExport(target, 'library-backup');
    for (const key of ['meta', 'notes', 'categories', 'bookmarks', 'settings', 'progress', 'devices'] as const) {
      expect(restored[key]).toHaveLength(backup[key].length);
    }
    expect(restored.meta).toEqual(expect.arrayContaining([
      expect.objectContaining({ favorite: true, current_read_through: 2, last_read_at: '2026-01-03T00:00:00+00:00', read_history: [{ read_through: 1, max_chapter: 900 }] }),
    ]));
    const client = await pool.connect();
    try {
      const states = await getLatestStates(client, target, novel);
      expect(states.latest_global?.chapter_num).toBe(60);
      // The UI hides behind devices, but their latest positions must survive in storage.
      expect(restored.progress).toEqual(expect.arrayContaining([
        expect.objectContaining({ chapter_num: 40, percent: 25 }),
      ]));
    } finally {
      client.release();
    }
    expect((await buildExport(source)).progress).toHaveLength(1005);
  });
});
