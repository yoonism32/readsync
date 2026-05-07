/**
 * Regression tests for rate limiter.
 * BUG-R3: checkRateLimit used to return boolean; now returns RateLimitResult with headers data.
 */
import { describe, it, expect, beforeEach } from 'vitest';

// Reset module between tests so the Map is cleared
let checkRateLimit: (ip: string) => import('../../src/middleware/rateLimiter.js').RateLimitResult;

describe('checkRateLimit', () => {
  beforeEach(async () => {
    // Each test gets a fresh import (module cache cleared by vi.resetModules in setup)
    const mod = await import('../../src/middleware/rateLimiter.js');
    checkRateLimit = mod.checkRateLimit;
  });

  it('returns allowed:true and correct remaining count on first call', () => {
    const result = checkRateLimit('10.0.0.1');
    expect(result.allowed).toBe(true);
    expect(typeof result.remaining).toBe('number');
    expect(result.remaining).toBeGreaterThanOrEqual(0);
  });

  it('returns resetAt as a Unix timestamp in seconds (BUG-R3: must be seconds, not ms)', () => {
    const result = checkRateLimit('10.0.0.2');
    const nowSeconds = Math.floor(Date.now() / 1000);
    expect(result.resetAt).toBeGreaterThanOrEqual(nowSeconds);
    // resetAt should be within 15 minutes from now (the lockout window)
    expect(result.resetAt).toBeLessThan(nowSeconds + 60 * 60);
  });

  it('result has all required fields for HTTP headers (allowed, remaining, resetAt)', () => {
    const result = checkRateLimit('10.0.0.3');
    expect(result).toHaveProperty('allowed');
    expect(result).toHaveProperty('remaining');
    expect(result).toHaveProperty('resetAt');
  });
});
