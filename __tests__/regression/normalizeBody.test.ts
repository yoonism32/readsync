/**
 * Regression test for opaque 500s on bodyless requests.
 *
 * DELETE /api/v1/novels/:novelId failed for every novel with
 *   TypeError: Cannot read properties of undefined (reading 'hard')
 * because Express 5 leaves `req.body` undefined when no parser matched, while
 * the route destructures it directly:
 *   const { hard = false } = req.body as { hard?: boolean };
 * That line sits above the route's try/catch, so the throw bypassed
 * handleDbError entirely and the client saw a bare 500 with no detail.
 */
import { describe, it, expect, vi } from 'vitest';
import type { Request, Response } from 'express';
import { normalizeBody } from '../../src/middleware/normalizeBody.js';

const run = (req: Partial<Request>) => {
  const next = vi.fn();
  normalizeBody(req as Request, {} as Response, next);
  return next;
};

describe('normalizeBody', () => {
  it('replaces an undefined body with an empty object', () => {
    const req: Partial<Request> = {};
    const next = run(req);
    expect(req.body).toEqual({});
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('leaves a parsed body untouched', () => {
    const req: Partial<Request> = { body: { hard: true } };
    run(req);
    expect(req.body).toEqual({ hard: true });
  });

  it('does not clobber a falsy-but-present body', () => {
    const req: Partial<Request> = { body: '' };
    run(req);
    expect(req.body).toBe('');
  });

  it('lets the delete-novel destructure fall back instead of throwing', () => {
    const req: Partial<Request> = {};
    run(req);
    expect(() => {
      const { hard = false } = req.body as { hard?: boolean };
      expect(hard).toBe(false);
    }).not.toThrow();
  });

  it('always calls next so the request continues', () => {
    expect(run({})).toHaveBeenCalledTimes(1);
    expect(run({ body: { a: 1 } })).toHaveBeenCalledTimes(1);
  });
});
