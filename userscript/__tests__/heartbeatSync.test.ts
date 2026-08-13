/**
 * Regression test: a scroll-driven sync can be delayed or missed (e.g. a
 * backgrounded window's scroll/timer delivery), leaving the Dashboard stuck
 * showing a stale percent with no self-correction — reported live: a chapter
 * scrolled to ~94% on a second-monitor window still showed 56% on the
 * Dashboard until the reading window was refocused.
 *
 * Fix: the periodic /compare tick already fetches this device's last-synced
 * percent for free (see ProgressSync.ts:checkForSyncConflict) — if the live
 * DOM position has pulled meaningfully ahead of it, push a catch-up sync on
 * that same tick instead of waiting for another scroll event.
 */
import { describe, expect, it } from 'vitest';
import { shouldHeartbeatSync } from '../src/services/ProgressSync.js';

describe('shouldHeartbeatSync', () => {
  it('does not sync when there is no known synced state yet', () => {
    expect(shouldHeartbeatSync(94, null)).toBe(false);
    expect(shouldHeartbeatSync(94, undefined)).toBe(false);
  });

  it('catches up when live position has pulled far ahead of the synced value', () => {
    // The reported scenario: synced at 56%, live DOM position is ~94%.
    expect(shouldHeartbeatSync(94, 56)).toBe(true);
  });

  it('does not sync on trivial scroll jitter/rounding noise', () => {
    expect(shouldHeartbeatSync(56.5, 56)).toBe(false);
  });

  it('does not sync when already in sync', () => {
    expect(shouldHeartbeatSync(56, 56)).toBe(false);
  });

  it('does not sync when live position is behind the synced value', () => {
    expect(shouldHeartbeatSync(30, 56)).toBe(false);
  });

  it('triggers just past the delta threshold', () => {
    expect(shouldHeartbeatSync(58.1, 56)).toBe(true);
  });

  it('does not trigger exactly at the delta threshold', () => {
    expect(shouldHeartbeatSync(58, 56)).toBe(false);
  });
});
