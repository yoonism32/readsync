import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import pool from '../../src/db/pool.js';
import { runMigrations } from '../../src/db/migrate.js';
import statsRouter from '../../src/routes/stats.js';
import { createApiKey } from '../../src/services/ApiKey.js';

describe.skipIf(!process.env.READSYNC_TEST_DATABASE_URL)('Replay with disposable PostgreSQL', () => {
  const owner = 'replay-audit-owner';
  const other = 'replay-audit-other';
  const novel = 'novelbin:replay-audit';
  const credentials = createApiKey();
  const app = express().use(statsRouter);

  beforeAll(async () => {
    await runMigrations();
    await pool.query('DELETE FROM users WHERE id = ANY($1::text[])', [[owner, other]]);
    await pool.query(
      'INSERT INTO users (id, display_name, api_key) VALUES ($1, $1, $3), ($2, $2, $4)',
      [owner, other, credentials.hash, createApiKey().hash],
    );
    await pool.query(
      "INSERT INTO novels (id, title) VALUES ($1, 'Replay audit') ON CONFLICT DO NOTHING",
      [novel],
    );
    await pool.query(
      'INSERT INTO devices (id, user_id, device_label) VALUES ($1, $1, $1), ($2, $2, $2)',
      [owner, other],
    );
  });

  beforeEach(async () => {
    for (const table of ['progress_snapshots', 'reading_sessions', 'user_novel_meta']) {
      await pool.query(`DELETE FROM ${table} WHERE user_id = ANY($1::text[])`, [[owner, other]]);
    }
  });

  afterAll(async () => {
    try {
      await pool.query('DELETE FROM users WHERE id = ANY($1::text[])', [[owner, other]]);
      await pool.query('DELETE FROM novels WHERE id = $1', [novel]);
    } finally {
      await pool.end();
    }
  });

  async function snapshot(at: string, chapter: number, user = owner, readThrough = 1) {
    await pool.query(
      `INSERT INTO progress_snapshots
       (user_id, device_id, novel_id, chapter_num, percent, created_at, read_through_num)
       VALUES ($1, $1, $2, $3, 50, $4, $5)`,
      [user, novel, chapter, at, readThrough],
    );
  }

  async function session(start: string, end: string | null, seconds: number, user = owner) {
    await pool.query(
      `INSERT INTO reading_sessions
       (user_id, device_id, novel_id, start_time, end_time, time_spent_seconds)
       VALUES ($1, $1, $2, $3, $4, $5)`,
      [user, novel, start, end, seconds],
    );
  }

  async function replay(month: string, timezone = 'Europe/London') {
    const response = await request(app)
      .get('/api/v1/stats/replay')
      .set('Authorization', `Bearer ${credentials.key}`)
      .query({ month, timezone });
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    return response.body;
  }

  it('includes leap day, excludes the next month, and isolates every aggregate by user', async () => {
    await snapshot('2028-01-31T23:59:59Z', 99);
    await snapshot('2028-02-01T00:00:00Z', 100);
    await snapshot('2028-02-29T23:59:59Z', 200);
    await snapshot('2028-03-01T00:00:00Z', 300);
    await snapshot('2028-02-15T12:00:00Z', 9999, other);
    await session('2028-02-29T23:30:00Z', '2028-03-01T00:30:00Z', 1800);
    await session('2028-02-15T12:00:00Z', '2028-02-15T13:00:00Z', 3600, other);
    await pool.query(
      `INSERT INTO user_novel_meta (user_id, novel_id, started_at, completed_at)
       VALUES ($1, $3, '2028-02-01T00:00:00Z', '2028-03-01T00:00:00Z'),
              ($2, $3, '2028-02-15T00:00:00Z', '2028-02-16T00:00:00Z')`,
      [owner, other, novel],
    );

    const result = await replay('2028-02', 'UTC');
    expect(result.period).toEqual({ local_start: '2028-02-01', local_end_exclusive: '2028-03-01' });
    expect(result.summary).toEqual({ recorded_reading_days: 2, titles_visited: 1, estimated_session_seconds: 900 });
    expect(result.days.map((day: { date: string }) => day.date)).toEqual(['2028-02-01', '2028-02-29']);
    expect(result.titles[0]).toMatchObject({ recorded_days: 2, observed_chapters: 2 });
    expect(result.coverage).toEqual({ first_recorded_at: '2028-02-01T00:00:00.000Z', last_recorded_at: '2028-02-29T23:59:59.000Z' });
    expect(result.milestones).toEqual({ started: [{ novel_id: novel, title: 'Replay audit', date: '2028-02-01' }], completed: [] });
    expect((await replay('2028-03', 'UTC')).summary.estimated_session_seconds).toBe(900);
  });

  it.each([
    {
      month: '2024-03', start: '2024-03-30T23:00:00Z', end: '2024-04-01T00:00:00Z', seconds: 9000,
      days: [{ date: '2024-03-30', estimated_session_seconds: 360 }, { date: '2024-03-31', estimated_session_seconds: 8280 }],
      nextMonth: '2024-04', nextDate: '2024-04-01',
    },
    {
      month: '2024-10', start: '2024-10-26T22:00:00Z', end: '2024-10-28T01:00:00Z', seconds: 9720,
      days: [{ date: '2024-10-26', estimated_session_seconds: 360 }, { date: '2024-10-27', estimated_session_seconds: 9000 }, { date: '2024-10-28', estimated_session_seconds: 360 }],
      nextMonth: null, nextDate: null,
    },
  ])('splits estimated time across London DST days in $month', async fixture => {
    await session(fixture.start, fixture.end, fixture.seconds);
    // An unfinished session must not contribute time or an extra activity day.
    await session(`${fixture.month}-02T12:00:00Z`, null, 7200);
    const result = await replay(fixture.month);
    expect(result.days).toEqual(fixture.days.map(day => ({ ...day, titles: [] })));
    expect(result.summary.estimated_session_seconds).toBe(fixture.days.reduce((sum, day) => sum + day.estimated_session_seconds, 0));
    if (fixture.nextMonth) {
      expect((await replay(fixture.nextMonth)).days).toEqual([{ date: fixture.nextDate, estimated_session_seconds: 360, titles: [] }]);
    }
  });

  it('uses London month boundaries and keeps rereads and observed chapter jumps distinct', async () => {
    await snapshot('2024-03-31T22:59:59Z', 999);
    await snapshot('2024-03-31T23:00:00Z', 100);
    await snapshot('2024-04-01T00:00:00Z', 200);
    await snapshot('2024-04-01T00:01:00Z', 200);
    await snapshot('2024-04-01T00:02:00Z', 100, owner, 2);
    await snapshot('2024-04-30T23:00:00Z', 999);
    const result = await replay('2024-04');
    expect(result.days).toHaveLength(1);
    expect(result.days[0].date).toBe('2024-04-01');
    expect(result.days[0].titles).toEqual([
      expect.objectContaining({ read_through: 1, from_chapter: 100, to_chapter: 200, observed_chapters: 2 }),
      expect.objectContaining({ read_through: 2, from_chapter: 100, to_chapter: 100, observed_chapters: 1 }),
    ]);
    expect(result.titles[0].observed_chapters).toBe(3);
    expect((await replay('2024-06')).summary).toEqual({ recorded_reading_days: 0, titles_visited: 0, estimated_session_seconds: 0 });
  });
});
