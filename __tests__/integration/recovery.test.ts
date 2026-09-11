import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import pool from '../../src/db/pool.js';
import { runMigrations } from '../../src/db/migrate.js';
import { createApp } from '../../src/app.js';
import { createApiKey, hashApiKey } from '../../src/services/ApiKey.js';
import { buildExport } from '../../src/services/ExportService.js';
import { restoreExport } from '../../src/services/ImportService.js';

vi.mock('../../src/services/AuthService.js', () => ({ verifyAdminCredentials: async (u: string, p: string) => u === 'admin' && p === 'test-password' }));

describe.skipIf(!process.env.READSYNC_TEST_DATABASE_URL)('disposable PostgreSQL integration', () => {
  const source = 'audit-source';
  const target = 'audit-target';
  const novelId = 'novelbin:audit-novel';
  const credential = createApiKey();
  let app: ReturnType<typeof createApp>;
  let agent: ReturnType<typeof request.agent>;

  beforeAll(async () => {
    await runMigrations();
    await runMigrations();
    await pool.query('DELETE FROM users WHERE id = ANY($1::text[])', [[source, target]]);
    await pool.query("INSERT INTO users (id, display_name, api_key) VALUES ($1, 'Audit source', $3), ($2, 'Audit target', $4)", [source, target, credential.hash, hashApiKey('target-test-token')]);
    await pool.query("INSERT INTO novels (id, title, primary_url) VALUES ($1, 'Audit novel', 'https://novelarrow.com/novel/audit-novel') ON CONFLICT DO NOTHING", [novelId]);
    await pool.query("INSERT INTO devices (id, user_id, device_label) VALUES ('audit-device', $1, 'Audit device')", [source]);
    await pool.query("INSERT INTO user_novel_meta (user_id, novel_id, current_read_through, read_history) VALUES ($1, $2, 2, '[{\"read_through\":1,\"max_chapter\":100}]')", [source, novelId]);
    await pool.query("INSERT INTO progress_snapshots (user_id, device_id, novel_id, chapter_num, percent, read_through_num, url) VALUES ($1, 'audit-device', $2, 100, 100, 1, 'https://novelarrow.com/novel/audit-novel/chapter-100'), ($1, 'audit-device', $2, 80, 40, 2, 'https://novelarrow.com/novel/audit-novel/chapter-80')", [source, novelId]);
    await pool.query("INSERT INTO novel_notes (user_id, novel_id, note_text) VALUES ($1, $2, 'Keep me')", [source, novelId]);
    await pool.query("INSERT INTO reading_sessions (user_id, novel_id, device_id, time_spent_seconds) VALUES ($1, $2, 'audit-device', 60)", [source, novelId]);
    process.env.ADMIN_USER_ID = source;
    app = createApp();
    agent = request.agent(app.app);
  });

  afterAll(async () => {
    await pool.query('DELETE FROM users WHERE id = ANY($1::text[])', [[source, target]]);
    await pool.query('DELETE FROM novels WHERE id = $1', [novelId]);
    await new Promise<void>(resolve => app.io.close(() => resolve()));
    await pool.end();
    delete process.env.ADMIN_USER_ID;
  });

  it('accepts header keys, rejects URL keys, and protects the admin report', async () => {
    expect((await request(app.app).get('/api/v1/auth/whoami').set('Authorization', `Bearer ${credential.key}`)).status).toBe(200);
    expect((await request(app.app).get('/api/v1/auth/whoami').query({ user_key: credential.key })).status).toBe(401);
    expect((await request(app.app).get('/api/v1/admin/novels/stale').set('Authorization', `Bearer ${credential.key}`)).status).toBe(401);
  });

  it('binds session login, rotates hashed keys, and rejects the previous key', async () => {
    const login = await agent.post('/api/auth/login').send({ username: 'admin', password: 'test-password' });
    expect(login.status).toBe(200);
    expect(login.body.api_key).toBeUndefined();
    expect((await agent.get('/api/v1/auth/whoami')).body.id).toBe(source);
    const key = await agent.post('/api/auth/api-key');
    expect(key.status).toBe(200);
    const stored = await pool.query('SELECT api_key FROM users WHERE id = $1', [source]);
    expect(stored.rows[0].api_key).toBe(hashApiKey(key.body.api_key));
    expect((await request(app.app).get('/api/v1/auth/whoami').set('Authorization', `Bearer ${credential.key}`)).status).toBe(401);
  });

  it('restores all read-throughs and notes without duplicating a repeated import', async () => {
    const exported = await buildExport(source);
    expect(exported.version).toBe(2);
    expect(exported.progress).toHaveLength(2);
    expect(JSON.stringify(exported)).not.toContain(credential.key);
    await restoreExport(exported as unknown as Record<string, unknown>, target);
    await restoreExport(exported as unknown as Record<string, unknown>, target);
    const restored = await buildExport(target);
    expect(restored.progress).toHaveLength(2);
    expect(restored.notes).toHaveLength(1);
    expect(restored.sessions).toHaveLength(1);
    expect((restored.meta[0] as { current_read_through: number }).current_read_through).toBe(2);
    expect((restored.meta[0] as { read_history: unknown[] }).read_history).toHaveLength(1);
  });

  it('rolls back an inconsistent restore', async () => {
    const exported = await buildExport(source);
    exported.notes.push({ novel_id: 'nonexistent', note_text: 'must not survive', created_at: new Date().toISOString() });
    await expect(restoreExport(exported as unknown as Record<string, unknown>, target)).rejects.toThrow();
    expect((await buildExport(target)).notes).toHaveLength(1);
  });

  it('restores through the HTTP route without duplicating the current library', async () => {
    const exported = await agent.get('/api/v1/export');
    expect(exported.status).toBe(200);
    const restored = await agent.post('/api/v1/import').send({ data: exported.body });
    expect(restored.status, JSON.stringify(restored.body)).toBe(200);
    const after = await buildExport(source);
    expect(after.progress).toHaveLength(2);
    expect(after.devices).toHaveLength(1);
    expect(after.notes).toHaveLength(1);
    const another = await agent.post('/api/v1/import').send({ data: after });
    expect(another.status).toBe(200);
    expect((await buildExport(source)).devices).toHaveLength(1);
  });

  it('honours a lower manual correction and consistent bulk completion', async () => {
    const corrected = await agent.post(`/api/v1/novels/${encodeURIComponent(novelId)}/progress-override`).send({ chapter_num: 10, percent: 25 });
    expect(corrected.status, JSON.stringify(corrected.body)).toBe(200);
    expect(corrected.body.states.latest_global.chapter_num).toBe(10);
    const completed = await agent.post('/api/v1/novels/bulk-status').send({ novel_ids: [novelId], status: 'completed' });
    expect(completed.status, JSON.stringify(completed.body)).toBe(200);
    const meta = await pool.query('SELECT completed_at, read_history FROM user_novel_meta WHERE user_id = $1 AND novel_id = $2', [source, novelId]);
    expect(meta.rows[0].completed_at).toBeTruthy();
    expect(meta.rows[0].read_history).toHaveLength(2);
    expect(meta.rows[0].read_history[1].max_chapter).toBe(10);
  });

  it('rejects cross-user device writes at the database boundary', async () => {
    await expect(pool.query('INSERT INTO reading_sessions (user_id, novel_id, device_id) VALUES ($1, $2, $3)', [target, novelId, 'audit-device'])).rejects.toMatchObject({ code: '23503' });
  });

  it('lists saved novels that have no progress yet', async () => {
    const savedId = 'novelbin:audit-unread';
    try {
      await pool.query("INSERT INTO novels (id, title) VALUES ($1, 'Unread novel')", [savedId]);
      await pool.query("INSERT INTO user_novel_meta (user_id, novel_id, status) VALUES ($1, $2, 'plan-to-read')", [source, savedId]);
      const response = await agent.get('/api/v1/novels');
      expect(response.status).toBe(200);
      expect(response.body).toEqual(expect.arrayContaining([expect.objectContaining({ novel_id: savedId, status: 'plan-to-read', latest_global: null })]));
    } finally {
      await pool.query('DELETE FROM user_novel_meta WHERE user_id = $1 AND novel_id = $2', [source, savedId]);
      await pool.query('DELETE FROM novels WHERE id = $1', [savedId]);
    }
  });
});
