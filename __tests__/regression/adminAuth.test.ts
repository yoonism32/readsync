/**
 * Regression test for a missing-auth bug: POST /admin/force-refresh-all was
 * the only route in admin.ts without validateApiKey, letting anyone clear
 * chapters_updated_at for every novel and (once the bot is wired) trigger a
 * full scrape cycle with no credentials at all.
 */
import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import adminRouter from '../../src/routes/admin.js';

describe('POST /admin/force-refresh-all — requires an api_key', () => {
  it('rejects a request with no api_key before touching the database', async () => {
    const app = express();
    app.use(express.json());
    app.use(adminRouter);

    const res = await request(app).post('/admin/force-refresh-all');

    expect(res.status).toBe(401);
  });
});
