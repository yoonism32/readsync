/**
 * GET /api/v1/novels/:novelId/synopsis — requireAuthAPI runs first, so an
 * unauthenticated request (no session) is rejected with 401 before the
 * route ever touches the database or validates the api key.
 */
import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import novelsRouter from '../../src/routes/novels.js';

const SYNOPSIS_URL = '/api/v1/novels/novelbin%3Atest/synopsis';

describe('GET /api/v1/novels/:novelId/synopsis — requires auth before touching the database', () => {
  it('rejects an unauthenticated request with 401', async () => {
    const app = express();
    app.use(express.json());
    app.use(novelsRouter);

    const res = await request(app).get(SYNOPSIS_URL);

    expect(res.status).toBe(401);
  });
});
