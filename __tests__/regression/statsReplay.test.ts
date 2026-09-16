import { describe, expect, it, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import type { AuthenticatedRequest } from '../../src/types/index.js';

const mocks = vi.hoisted(() => ({ query: vi.fn() }));

vi.mock('../../src/db/pool.js', () => ({
  default: { query: mocks.query },
}));

import statsRouter from '../../src/routes/stats.js';

function app() {
  const instance = express();
  instance.use((req, _res, next) => {
    (req as AuthenticatedRequest).user = { id: 'owner-id', display_name: 'Owner' };
    next();
  });
  instance.use(statsRouter);
  return instance;
}

beforeEach(() => mocks.query.mockReset());

describe('GET /api/v1/stats/replay', () => {
  it.each([
    '',
    '?month=2026-13&timezone=Europe%2FLondon',
    '?month=0000-01&timezone=UTC',
    '?month=2026-09&timezone=Not%2FAZone',
  ])('rejects an invalid calendar contract: %s', async suffix => {
    const response = await request(app()).get(`/api/v1/stats/replay${suffix}`);
    expect(response.status).toBe(400);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it('returns one bounded, numeric month summary with honest observed ranges', async () => {
    mocks.query
      .mockResolvedValueOnce({ rows: [{
        date: '2026-09-03', novel_id: 'novel:one', title: 'One', read_through: 1,
        from_chapter: 100, to_chapter: 200, observed_chapters: '2',
        first_observed_at: '2026-09-03T10:00:00.000Z', last_observed_at: '2026-09-03T11:00:00.000Z',
      }] })
      .mockResolvedValueOnce({ rows: [{
        novel_id: 'novel:one', title: 'One', recorded_days: '1', observed_chapters: '2',
        from_chapter: 100, to_chapter: 200,
        first_observed_at: '2026-09-03T10:00:00.000Z', last_observed_at: '2026-09-03T11:00:00.000Z',
      }] })
      .mockResolvedValueOnce({ rows: [{ date: '2026-09-03', estimated_session_seconds: '1800' }] })
      .mockResolvedValueOnce({ rows: [{
        novel_id: 'novel:one', title: 'One', started_on: '2026-09-02', completed_on: null,
      }] })
      .mockResolvedValueOnce({ rows: [{
        first_recorded_at: '2026-09-01T00:00:00.000Z', last_recorded_at: '2026-09-03T11:00:00.000Z',
      }] });

    const response = await request(app())
      .get('/api/v1/stats/replay?month=2026-09&timezone=Europe%2FLondon');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      month: '2026-09', timezone: 'Europe/London',
      period: { local_start: '2026-09-01', local_end_exclusive: '2026-10-01' },
      coverage: {
        first_recorded_at: '2026-09-01T00:00:00.000Z',
        last_recorded_at: '2026-09-03T11:00:00.000Z',
      },
      summary: { recorded_reading_days: 1, titles_visited: 1, estimated_session_seconds: 1800 },
      days: [{
        date: '2026-09-03', estimated_session_seconds: 1800,
        titles: [{ from_chapter: 100, to_chapter: 200, observed_chapters: 2 }],
      }],
      titles: [{ recorded_days: 1, observed_chapters: 2 }],
      milestones: { started: [{ novel_id: 'novel:one' }], completed: [] },
    });

    expect(mocks.query).toHaveBeenCalledTimes(5);
    for (const [sql, params] of mocks.query.mock.calls) {
      expect(params).toEqual(['owner-id', '2026-09', 'Europe/London']);
      expect(String(sql)).toContain('AT TIME ZONE $3');
    }
    const snapshotSql = String(mocks.query.mock.calls[0][0]);
    expect(snapshotSql).toContain('p.created_at >= b.utc_start');
    expect(snapshotSql).toContain('p.created_at < b.utc_end');
    expect(snapshotSql).not.toContain('p.created_at <= b.utc_end');
    expect(snapshotSql).toContain('COUNT(DISTINCT p.chapter_num)');
    const sessionSql = String(mocks.query.mock.calls[2][0]);
    expect(sessionSql).toContain('LEAST(s.end_time, d.utc_end)');
    expect(sessionSql).toContain('GREATEST(s.start_time, d.utc_start)');
    expect(sessionSql).toContain('s.start_time < d.utc_end');
    expect(sessionSql).toContain('s.end_time > d.utc_start');
  });

  it('returns a useful empty month without implying that no reading occurred', async () => {
    mocks.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ first_recorded_at: null, last_recorded_at: null }] });

    const response = await request(app())
      .get('/api/v1/stats/replay?month=2028-02&timezone=UTC');

    expect(response.status).toBe(200);
    expect(response.body.period.local_end_exclusive).toBe('2028-03-01');
    expect(response.body.summary).toEqual({
      recorded_reading_days: 0, titles_visited: 0, estimated_session_seconds: 0,
    });
    expect(response.body.days).toEqual([]);
  });
});
