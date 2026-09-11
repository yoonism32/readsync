/**
 * Regression test for the userscript self-update gap: dist-userscript/ was
 * built by `build:all` but never served, so @updateURL/@downloadURL had
 * nowhere to point and every fix required a manual rebuild + reinstall.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, afterAll, beforeAll, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createUserscriptRouter } from '../../src/routes/userscript.js';

describe('GET /u/:token/readsync.user.js — serves the built userscript for self-update checks', () => {
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'readsync-userscript-test-'));
  const fixturePath = path.join(fixtureDir, 'readsync.user.js');
  const TOKEN = 'test-update-token';
  const previousToken = process.env.USERSCRIPT_UPDATE_TOKEN;

  beforeAll(() => {
    process.env.USERSCRIPT_UPDATE_TOKEN = TOKEN;
  });

  afterEach(() => {
    process.env.USERSCRIPT_UPDATE_TOKEN = TOKEN;
  });

  afterAll(() => {
    fs.rmSync(fixtureDir, { recursive: true, force: true });
    process.env.USERSCRIPT_UPDATE_TOKEN = previousToken;
  });

  it('serves the file with a JS content type and no-cache so managers always see the latest version', async () => {
    fs.writeFileSync(fixturePath, '// ==UserScript==\n// @version 1.0.0\n// ==/UserScript==\n');
    const app = express();
    app.use(createUserscriptRouter(fixturePath));

    const res = await request(app).get(`/u/${TOKEN}/readsync.user.js`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('javascript');
    expect(res.headers['cache-control']).toBe('no-cache');
  });

  it('returns 404 instead of crashing when the userscript has not been built yet', async () => {
    const app = express();
    app.use(createUserscriptRouter(path.join(fixtureDir, 'missing.user.js')));

    const res = await request(app).get(`/u/${TOKEN}/readsync.user.js`);

    expect(res.status).toBe(404);
  });

  it('returns 404 for a wrong or missing token instead of revealing the key-bearing file', async () => {
    fs.writeFileSync(fixturePath, '// ==UserScript==\n// @version 1.0.0\n// ==/UserScript==\n');
    const app = express();
    app.use(createUserscriptRouter(fixturePath));

    const wrongToken = await request(app).get('/u/not-the-token/readsync.user.js');
    expect(wrongToken.status).toBe(404);

    const publicPath = await request(app).get('/readsync.user.js');
    expect(publicPath.status).toBe(404);
  });

  it('returns 404 when USERSCRIPT_UPDATE_TOKEN is not configured, even with a matching-looking guess', async () => {
    delete process.env.USERSCRIPT_UPDATE_TOKEN;
    fs.writeFileSync(fixturePath, '// ==UserScript==\n// @version 1.0.0\n// ==/UserScript==\n');
    const app = express();
    app.use(createUserscriptRouter(fixturePath));

    const res = await request(app).get(`/u/${TOKEN}/readsync.user.js`);

    expect(res.status).toBe(404);
  });
});
