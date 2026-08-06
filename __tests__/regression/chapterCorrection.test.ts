/**
 * Regression tests for self-healing an inflated novels.latest_chapter_num.
 *
 * The auto-update guard rejects any scrape reporting a chapter_num below the
 * stored value outright — a single flaky page load must never claw back real
 * progress. But ChapterDetector's header-count fallback could (before the
 * 2026-08-06 fix in latestChapterDetection.test.ts) overshoot the true latest
 * chapter, and once that happened the guard trapped the wrong number forever:
 * nothing could ever "advance" past a chapter that was never real.
 *
 * The fix: a single low scrape still isn't trusted, but the SAME lower number
 * reported twice — typically two Refresh All runs apart — is. A fluke won't
 * repeat the exact same wrong number; a systematic overshoot will report the
 * true count every time.
 */
import { describe, expect, it } from 'vitest';
import {
  isChapterRegression,
  isConfirmedChapterCorrection,
} from '../../src/routes/admin.js';

describe('isChapterRegression', () => {
  it('is not a regression when there is no stored chapter yet', () => {
    expect(isChapterRegression(5, null)).toBe(false);
  });

  it('is not a regression when the scrape advances the count', () => {
    expect(isChapterRegression(1530, 1529)).toBe(false);
  });

  it('is not a regression when the scrape repeats the stored count', () => {
    expect(isChapterRegression(1529, 1529)).toBe(false);
  });

  it('is a regression when the scrape reports fewer chapters than stored', () => {
    expect(isChapterRegression(1527, 1529)).toBe(true);
  });
});

describe('isConfirmedChapterCorrection', () => {
  it('is not confirmed on the first sighting of a lower number', () => {
    expect(isConfirmedChapterCorrection(undefined, 1527, 1529)).toBe(false);
  });

  it('is not confirmed when the second sighting disagrees with the first', () => {
    expect(isConfirmedChapterCorrection(1500, 1527, 1529)).toBe(false);
  });

  it('is confirmed when the same lower number is seen twice', () => {
    expect(isConfirmedChapterCorrection(1527, 1527, 1529)).toBe(true);
  });

  it('is not confirmed if the stored count already matches (nothing to correct)', () => {
    expect(isConfirmedChapterCorrection(1527, 1527, 1527)).toBe(false);
  });

  it('is not confirmed when there is no stored chapter yet', () => {
    expect(isConfirmedChapterCorrection(5, 5, null)).toBe(false);
  });
});
