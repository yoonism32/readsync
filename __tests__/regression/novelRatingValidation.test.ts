/**
 * PUT /api/v1/novels/:novelId/rating — the express-validator chain runs
 * before validateApiKey, so an out-of-range rating is rejected with 400
 * without ever needing a valid api_key or touching the database.
 */
import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import novelsRouter from '../../src/routes/novels.js';

const RATING_URL = '/api/v1/novels/novelbin%3Atest/rating';

describe('PUT /api/v1/novels/:novelId/rating — validates before touching the database', () => {
  it('rejects a rating above 5', async () => {
    const app = express();
    app.use(express.json());
    app.use(novelsRouter);

    const res = await request(app).put(RATING_URL).send({ rating: 7 });

    expect(res.status).toBe(400);
  });

  it('rejects a negative rating', async () => {
    const app = express();
    app.use(express.json());
    app.use(novelsRouter);

    const res = await request(app).put(RATING_URL).send({ rating: -1 });

    expect(res.status).toBe(400);
  });

  it('rejects a non-numeric rating', async () => {
    const app = express();
    app.use(express.json());
    app.use(novelsRouter);

    const res = await request(app).put(RATING_URL).send({ rating: 'five' });

    expect(res.status).toBe(400);
  });

  it('rejects a missing rating', async () => {
    const app = express();
    app.use(express.json());
    app.use(novelsRouter);

    const res = await request(app).put(RATING_URL).send({});

    expect(res.status).toBe(400);
  });
});
