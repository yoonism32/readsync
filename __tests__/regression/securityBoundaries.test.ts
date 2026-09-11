import { describe, expect, it, vi } from 'vitest';
import type { Request, Response as ExpressResponse } from 'express';
import { validatePagination } from '../../src/middleware/validation.js';
import { createApiKey, hashApiKey } from '../../src/services/ApiKey.js';
import { validateImport } from '../../src/services/ImportService.js';
import { MAX_COVER_UPLOAD_BYTES, readBoundedCover } from '../../src/routes/covers.js';

describe('security boundaries', () => {
  it.each(['NaN', 'Infinity', '-1', '1.5', '', ['2'], {}])('rejects invalid pagination %j', value => {
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();
    validatePagination({ query: { offset: value } } as unknown as Request, res as unknown as ExpressResponse, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });
  it('generates unique credentials and stores only deterministic hashes', () => {
    const a = createApiKey(); const b = createApiKey();
    expect(a.key).not.toBe(b.key);
    expect(a.hash).toBe(hashApiKey(a.key));
    expect(a.hash).not.toContain(a.key);
  });
  it('rejects unsupported backup versions and active-content URLs', () => {
    expect(() => validateImport({ version: 3, novels: [] })).toThrow();
    expect(() => validateImport({ novels: [{ primary_url: 'javascript:alert(1)' }] })).toThrow();
    expect(() => validateImport({ novels: null })).toThrow();
    expect(() => validateImport({ novels: [], progress: {} })).toThrow();
  });
  it('bounds upstream cover bytes even without a Content-Length header', async () => {
    const response = new Response(new Uint8Array(MAX_COVER_UPLOAD_BYTES + 1));
    await expect(readBoundedCover(response)).rejects.toThrow('size limit');
  });
});
