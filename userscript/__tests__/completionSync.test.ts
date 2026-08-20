/**
 * Regression test: main.ts's completion fast-path (>= RESTORE_LIMIT) used
 * to fire an un-debounced sync on ANY upward percent change, so sub-percent
 * scroll jitter in the final 10% of a chapter produced dozens of near-
 * duplicate syncs. Confirmed live in the 2026-08-20 egress incident: one
 * device alone produced 11,129 syncs in 24h, with 39% (4,378) already
 * >=90% re-firing against another >=90% ping — some chapters saw 90-140
 * completion-tail pings in under 4 minutes.
 *
 * Fix: throttle completion re-syncs to a minimum percent delta, same
 * pattern as shouldHeartbeatSync's catch-up threshold.
 */
import { describe, expect, it } from 'vitest';
import { shouldSyncCompletion } from '../src/services/ProgressSync.js';

describe('shouldSyncCompletion', () => {
  it('always syncs the first crossing into the completion zone', () => {
    // lastSyncedPct starts at -1 per chapter (see main.ts) — the first
    // crossing at RESTORE_LIMIT clears any realistic threshold on its own.
    expect(shouldSyncCompletion(90, -1, 2)).toBe(true);
  });

  it('does not sync on sub-percent scroll jitter', () => {
    // The exact incident pattern: 90.5867 -> 90.6463 -> 90.8163.
    expect(shouldSyncCompletion(90.6463, 90.5867, 2)).toBe(false);
  });

  it('does not trigger exactly at the delta threshold', () => {
    expect(shouldSyncCompletion(92, 90, 2)).toBe(false);
  });

  it('triggers just past the delta threshold', () => {
    expect(shouldSyncCompletion(92.1, 90, 2)).toBe(true);
  });

  it('syncs literal completion even after a throttled plateau', () => {
    expect(shouldSyncCompletion(100, 97, 2)).toBe(true);
  });

  it('does not sync when percent has not moved', () => {
    expect(shouldSyncCompletion(95, 95, 2)).toBe(false);
  });
});
