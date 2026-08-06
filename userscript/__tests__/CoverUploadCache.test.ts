/**
 * Only the TTL decision is pure and worth unit-testing here — load()/save()
 * touch localStorage, which isn't available under vitest's node environment
 * (matches the userscript's own OfflineQueue.ts, which is exercised
 * end-to-end in-browser rather than under a DOM test harness).
 */
import { describe, expect, it } from 'vitest';
import { isEntryFresh } from '../src/services/CoverUploadCache.js';

describe('isEntryFresh', () => {
  const now = 1_700_000_000_000;
  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

  it('is not fresh when there is no entry', () => {
    expect(isEntryFresh(undefined, now)).toBe(false);
  });

  it('is fresh right after being recorded', () => {
    expect(isEntryFresh({ uploadedAt: now }, now)).toBe(true);
  });

  it('is fresh just under the TTL', () => {
    expect(isEntryFresh({ uploadedAt: now - (SEVEN_DAYS_MS - 1) }, now)).toBe(true);
  });

  it('is stale exactly at the TTL boundary', () => {
    expect(isEntryFresh({ uploadedAt: now - SEVEN_DAYS_MS }, now)).toBe(true);
  });

  it('is stale past the TTL', () => {
    expect(isEntryFresh({ uploadedAt: now - SEVEN_DAYS_MS - 1 }, now)).toBe(false);
  });

  it('respects a custom ttlMs override', () => {
    expect(isEntryFresh({ uploadedAt: now - 1000 }, now, 500)).toBe(false);
    expect(isEntryFresh({ uploadedAt: now - 1000 }, now, 2000)).toBe(true);
  });
});
