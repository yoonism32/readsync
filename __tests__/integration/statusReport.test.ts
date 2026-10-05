import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import pool from '../../src/db/pool.js';
import { runMigrations } from '../../src/db/migrate.js';
import { hashApiKey } from '../../src/services/ApiKey.js';

vi.mock('../../src/services/BackupService.js', () => ({
  BACKUP_MIN_AGE_HOURS: 20,
  getBackupInventory: async () => ({ status: 'not_configured', files: [], truncated: false }),
}));
import statusRouter from '../../src/routes/status.js';

const owner = 'status-report-owner';
const stranger = 'status-report-stranger';
const key = 'status-report-test-key';
const novels = ['status:reading', 'status:removed', 'status:private', 'status:planned'];
const app = express().use(statusRouter);

describe.skipIf(!process.env.READSYNC_TEST_DATABASE_URL)('status report PostgreSQL integration', () => {
  beforeAll(async () => {
    await runMigrations();
    await pool.query('INSERT INTO users (id, display_name, api_key) VALUES ($1, $1, $3), ($2, $2, $4)', [owner, stranger, hashApiKey(key), hashApiKey('status-stranger-key')]);
    for (const id of novels) await pool.query('INSERT INTO novels (id, title, latest_chapter_num) VALUES ($1, $1, 100)', [id]);
    await pool.query("INSERT INTO devices (id, user_id, device_label) VALUES ('status-reader', $1, 'Reader'), ('manual:status', $1, 'Manual'), ('status-other', $2, 'Other')", [owner, stranger]);
    await pool.query(`INSERT INTO user_novel_meta (user_id, novel_id, status, current_read_through, progress_reset_at, last_read_at) VALUES
      ($1, 'status:reading', 'reading', 2, '2026-09-01', '2026-09-02'),
      ($1, 'status:removed', 'removed', 1, NULL, NULL),
      ($1, 'status:planned', 'plan-to-read', 1, NULL, NULL),
      ($2, 'status:private', 'reading', 1, NULL, NULL)`, [owner, stranger]);
    await pool.query(`INSERT INTO progress_snapshots (user_id, device_id, novel_id, chapter_num, percent, read_through_num, created_at) VALUES
      ($1, 'status-reader', 'status:reading', 100, 100, 1, '2026-08-01'),
      ($1, 'status-reader', 'status:reading', 90, 100, 2, '2026-08-31'),
      ($1, 'status-reader', 'status:reading', 20, 25, 2, '2026-09-01T12:00:00Z'),
      ($1, 'manual:status', 'status:reading', 30, 50, 2, '2026-09-03'),
      ($1, 'status-reader', 'status:removed', 99, 80, 1, '2026-09-04'),
      ($2, 'status-other', 'status:private', 80, 80, 1, '2026-09-05')`, [owner, stranger]);
  });
  afterAll(async () => {
    await pool.query('DELETE FROM users WHERE id = ANY($1)', [[owner, stranger]]);
    await pool.query('DELETE FROM novels WHERE id = ANY($1)', [novels]);
    await pool.end();
  });

  it('uses the current read-through and reset cutoff, preserves last-read override, and excludes other accounts', async () => {
    const response = await request(app).get('/api/v1/status').set('Authorization', `Bearer ${key}`);
    expect(response.status).toBe(200);
    const { body } = response;
    expect(body.library).toEqual({ total_novels: 2, by_status: { reading: 1, 'plan-to-read': 1 }, novels_behind: 1, chapters_behind: 70 });
    expect(body.reading.recent).toHaveLength(1);
    expect(body.reading.recent[0]).toMatchObject({ novel_id: 'status:reading', chapter: 30, chapter_percent: 50, read_through: 2 });
    expect(Date.parse(body.reading.recent[0].last_read_at)).toBe(Date.parse('2026-09-02T00:00:00Z'));
    expect(body.storage.progress_snapshots).toBe(5);
    expect(body.reading.active_devices).toBe(1);
    expect(JSON.stringify(body)).not.toContain('status:private');
    expect(body.reading.last_sync_at).toBe('2026-09-04T00:00:00.000Z');
  });

  it('uses real reader activity after removing an override, not the newer manual correction', async () => {
    await pool.query("UPDATE user_novel_meta SET last_read_at = NULL WHERE user_id = $1 AND novel_id = 'status:reading'", [owner]);
    const { body } = await request(app).get('/api/v1/status').set('Authorization', `Bearer ${key}`);
    expect(Date.parse(body.reading.recent[0].last_read_at)).toBe(Date.parse('2026-09-01T12:00:00Z'));
  });
});
