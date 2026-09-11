import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import pool from '../../src/db/pool.js';
import { validateApiKey } from '../../src/middleware/auth.js';
import { hashApiKey } from '../../src/services/ApiKey.js';

vi.mock('../../src/db/pool.js', () => ({ default: { query: vi.fn() } }));
describe('environment userscript key', () => {
  beforeEach(() => { vi.stubEnv('API_KEY', 'test-environment-key'); vi.stubEnv('ADMIN_USER_ID', ''); vi.clearAllMocks(); });
  afterEach(() => vi.unstubAllEnvs());
  async function authenticate(key = 'test-environment-key') {
    const req = { get: () => `Bearer ${key}` } as unknown as Request;
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();
    await validateApiKey(req, res as unknown as Response, next);
    return { req, res, next };
  }
  it('binds the environment key to the sole user', async () => {
    vi.mocked(pool.query).mockResolvedValue({ rows: [{ id: 'owner' }] } as never);
    const { next } = await authenticate();
    expect(next).toHaveBeenCalledWith();
    expect(pool.query).toHaveBeenCalledWith('SELECT id, display_name FROM users LIMIT 2', []);
  });
  it.each([{ rows: [] }, { rows: [{ id: 'a' }, { id: 'b' }] }])('rejects missing or ambiguous ownership', async ({ rows }) => {
    vi.mocked(pool.query).mockResolvedValue({ rows } as never);
    const { res, next } = await authenticate();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
  it('uses explicit owner configuration', async () => {
    vi.stubEnv('ADMIN_USER_ID', 'owner');
    vi.mocked(pool.query).mockResolvedValue({ rows: [{ id: 'owner' }] } as never);
    await authenticate();
    expect(pool.query).toHaveBeenCalledWith('SELECT id, display_name FROM users WHERE id = $1 LIMIT 2', ['owner']);
  });
  it('keeps database-key validation for other credentials', async () => {
    vi.mocked(pool.query).mockResolvedValue({ rows: [] } as never);
    const { res } = await authenticate('wrong');
    expect(pool.query).toHaveBeenCalledWith('SELECT id, display_name FROM users WHERE api_key = $1', [hashApiKey('wrong')]);
    expect(res.status).toHaveBeenCalledWith(401);
  });
});
