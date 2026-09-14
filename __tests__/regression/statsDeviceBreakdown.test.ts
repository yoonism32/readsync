import { describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import type { AuthenticatedRequest } from '../../src/types/index.js';

const mocks = vi.hoisted(() => ({ query: vi.fn() }));

vi.mock('../../src/db/pool.js', () => ({
  default: { query: mocks.query },
}));

import statsRouter from '../../src/routes/stats.js';

describe('GET /api/v1/stats/breakdown — registered devices', () => {
  it('keeps devices visible even when they have no completed sessions', async () => {
    mocks.query.mockImplementation((sql: string) => {
      if (sql.includes('FROM devices d')) {
        return Promise.resolve({
          rows: [
            { device_group_id: 'chrome-id', device_group_label: 'Chrome', sessions: '0', seconds: '0' },
            { device_group_id: 'safari-id', device_group_label: 'Safari', sessions: '0', seconds: '0' },
          ],
        });
      }
      return Promise.resolve({ rows: [] });
    });

    const app = express();
    app.use((req, _res, next) => {
      (req as AuthenticatedRequest).user = { id: 'owner-id', display_name: 'Owner' };
      next();
    });
    app.use(statsRouter);

    const response = await request(app).get('/api/v1/stats/breakdown?window=week');

    expect(response.status).toBe(200);
    expect(response.body.by_device).toEqual([
      { device_id: 'chrome-id', device_label: 'Chrome', sessions: 0, seconds: 0 },
      { device_id: 'safari-id', device_label: 'Safari', sessions: 0, seconds: 0 },
    ]);

    const deviceSql = mocks.query.mock.calls
      .map(([sql]) => String(sql))
      .find(sql => sql.includes('FROM devices d'));
    expect(deviceSql).toContain('LEFT JOIN reading_sessions');
    expect(deviceSql).toContain('WHERE d.user_id = $1');
    expect(deviceSql).not.toContain('date_trunc(\'week\', now())');
  });
});
