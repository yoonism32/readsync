/**
 * Regression test: reported live — a reader finished chapter 254, its
 * completion sync (immediate, un-debounced) was still in flight when they
 * navigated to chapter 255. Chapter 255's own heartbeat sync landed first
 * and moved the bookmark to 255; the late 254 completion sync then got
 * rejected as behind_chapter (254 < 255) and the peek banner fired on
 * whatever chapter was on screen when that stale response resolved —
 * chapter 255, the chapter the reader had just started, not the chapter
 * that was actually rejected.
 *
 * Fix: only show the peek banner when the rejection is still about the
 * chapter currently displayed (see ProgressSync.ts:syncProgress).
 */
import { describe, expect, it } from 'vitest';
import { isRejectionStale } from '../src/services/ProgressSync.js';

describe('isRejectionStale', () => {
  it('is stale when the reader has navigated to a later chapter since the request was sent', () => {
    // The reported scenario: chapter 254's rejection lands while chapter 255 is on screen.
    expect(isRejectionStale(254, 255)).toBe(true);
  });

  it('is not stale when the rejection is still about the chapter on screen', () => {
    expect(isRejectionStale(257, 257)).toBe(false);
  });

  it('is stale when the current chapter is unknown (navigated to a non-chapter page)', () => {
    expect(isRejectionStale(257, null)).toBe(true);
  });

  it('is stale even if the reader navigated backward since the request was sent', () => {
    expect(isRejectionStale(260, 258)).toBe(true);
  });
});
