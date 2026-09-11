import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Socket } from 'socket.io';
import pool from '../../src/db/pool.js';
import { authenticateSocket } from '../../src/websocket/auth.js';

vi.mock('../../src/db/pool.js', () => ({ default: { query: vi.fn() } }));

beforeEach(() => {
  vi.mocked(pool.query).mockReset();
  vi.mocked(pool.query).mockResolvedValue({ rows: [{ id: 'reader' }] } as never);
});

describe('browser socket authentication', () => {
  it.each([
    { origin: 'http://localhost:3000' },
    { 'sec-fetch-site': 'same-origin' },
  ])('accepts a bound session from the dashboard: %j', async headers => {
    const socket = { request: { session: { authenticated: true, userId: 'reader' } }, handshake: { headers } } as unknown as Socket;
    const next = vi.fn();
    await authenticateSocket(socket, next);
    expect(next).toHaveBeenCalledWith();
    expect(socket.userId).toBe('reader');
  });
  it.each([
    { origin: 'https://attacker.example' },
    { 'sec-fetch-site': 'cross-site' },
    {},
  ])('rejects untrusted origins before a database query: %j', async headers => {
    const socket = { request: { session: { authenticated: true, userId: 'reader' } }, handshake: { headers } } as unknown as Socket;
    const next = vi.fn();
    await authenticateSocket(socket, next);
    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(pool.query).not.toHaveBeenCalled();
  });
});
