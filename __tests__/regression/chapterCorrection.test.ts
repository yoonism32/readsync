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
 *
 * recordCorrectionAttempt() is the stateful wrapper shared by both writers of
 * novels.latest_chapter_num (src/routes/admin.ts's novel-page auto-update and
 * src/routes/progress.ts's per-chapter sync) — a pending correction recorded
 * by either path counts as confirmation for both, since they report on the
 * same column.
 */
import { describe, expect, it } from 'vitest';
import {
  isChapterRegression,
  isConfirmedChapterCorrection,
  recordCorrectionAttempt,
} from '../../src/services/ChapterCorrection.js';

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

describe('recordCorrectionAttempt', () => {
  it('rejects the first sighting of a lower number and remembers it as pending', () => {
    const novelId = 'novelbin:record-first-sighting';
    expect(recordCorrectionAttempt(novelId, 1527, 1529)).toBe(false);
    // The pending entry now holds 1527 — a second call with the SAME number confirms it.
    expect(recordCorrectionAttempt(novelId, 1527, 1529)).toBe(true);
  });

  it('does not confirm on a disagreeing second sighting, and resets the pending value', () => {
    const novelId = 'novelbin:record-disagreeing-sighting';
    expect(recordCorrectionAttempt(novelId, 1527, 1529)).toBe(false);
    expect(recordCorrectionAttempt(novelId, 1500, 1529)).toBe(false);
    // 1500 is now pending, not 1527 — repeating 1527 must start over.
    expect(recordCorrectionAttempt(novelId, 1527, 1529)).toBe(false);
  });

  it('clears the pending entry once an ordinary advance is scraped', () => {
    const novelId = 'novelbin:record-cleared-by-advance';
    expect(recordCorrectionAttempt(novelId, 1527, 1529)).toBe(false);
    recordCorrectionAttempt(novelId, 1530, 1529); // ordinary advance, not a regression
    // Pending entry is gone — a later regression to 1527 needs two fresh sightings again.
    expect(recordCorrectionAttempt(novelId, 1527, 1530)).toBe(false);
  });

  it('is independent per novel id', () => {
    recordCorrectionAttempt('novelbin:record-novel-a', 100, 200);
    expect(recordCorrectionAttempt('novelbin:record-novel-b', 100, 200)).toBe(
      false,
    );
  });
});
