/**
 * Regression test for a missing-auth bug: POST /admin/force-refresh-all was
 * the only route in admin.ts without validateApiKey, letting anyone clear
 * chapters_updated_at for every novel and (once the bot is wired) trigger a
 * full scrape cycle with no credentials at all.
 */
import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import type { Server as SocketServer } from 'socket.io';
import { createAdminRouter } from '../../src/routes/admin.js';

// This route never emits, so a no-op stub is enough to satisfy the factory.
const fakeIo = { to: () => ({ emit: () => {} }) } as unknown as SocketServer;

describe('POST /admin/force-refresh-all — requires an api_key', () => {
  it('rejects a request with no api_key before touching the database', async () => {
    const app = express();
    app.use(express.json());
    app.use(createAdminRouter(fakeIo));

    const res = await request(app).post('/admin/force-refresh-all');

    expect(res.status).toBe(401);
  });
});
