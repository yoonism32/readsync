/**
 * Regression tests for false-positive auto-reread detection.
 *
 * Case 1 (second device): auto-reread detection compared a novel-wide max
 * chapter (across every device) against the chapter number in a single sync
 * request. Read chapter 500 on desktop, then open the same novel for the
 * first time on a new phone landing on chapter 10 — that one sync computed
 * 500 - 10 >= 50 and archived the still-ongoing read as "completed",
 * starting a phantom read-through #2, with no malicious input required:
 * just the ordinary multi-device flow the app exists to support.
 *
 * Fix: scope the max-chapter query to the device making the request, so
 * isAutoReread() only ever sees a genuine same-device drop.
 *
 * Case 2 (stale tab mid-book): a browser tab backgrounded long enough to be
 * discarded gets silently reloaded on refocus, replaying whatever chapter
 * was on screen months ago. A 672-chapter novel finished on another device,
 * refocused on a tab still sitting on chapter 337, computed 672 - 337 >= 50
 * and was misread the same way — a phantom read-through starting mid-book,
 * even though nothing about it resembled an intentional restart.
 *
 * Fix: require the incoming chapter be near the actual start of the novel
 * (AUTO_REREAD_MAX_START_CHAPTER) before auto-detecting a reread. Anything
 * else falls through to the existing behind_chapter rejection + confirm
 * banner, which requires explicit user action to start a new read-through.
 */
import { describe, expect, it } from 'vitest';
import { AUTO_REREAD_MAX_START_CHAPTER } from '../../src/config.js';
import { isAutoReread } from '../../src/routes/progress.js';

describe('isAutoReread', () => {
  it('detects a genuine same-device reread', () => {
    // This device previously reached chapter 500; it's now back at chapter 1.
    expect(isAutoReread(500, 1)).toBe(true);
  });

  it('is not fooled by a new device with no prior chapters on this novel', () => {
    // A brand-new device has no history for this novel — its own max is 0.
    expect(isAutoReread(0, 10)).toBe(false);
  });

  it('does not trigger on an ordinary forward read', () => {
    expect(isAutoReread(100, 105)).toBe(false);
  });

  it('does not trigger just under the threshold', () => {
    expect(isAutoReread(100, 51)).toBe(false);
  });

  it('triggers exactly at the chapter-delta threshold when starting near chapter 1', () => {
    expect(isAutoReread(55, 5)).toBe(true);
  });

  it('is not fooled by a stale tab reloading mid-book', () => {
    // Finished at chapter 672; a long-backgrounded tab reloads still
    // showing chapter 337 — a big backward delta, but nowhere near the
    // start, so this must NOT be read as an intentional reread.
    expect(isAutoReread(672, 337)).toBe(false);
  });

  it('still triggers for a genuine near-start reread on a long novel', () => {
    expect(isAutoReread(672, 1)).toBe(true);
  });

  it('triggers at the near-start boundary', () => {
    expect(isAutoReread(672, AUTO_REREAD_MAX_START_CHAPTER)).toBe(true);
  });

  it('does not trigger just past the near-start boundary', () => {
    expect(isAutoReread(672, AUTO_REREAD_MAX_START_CHAPTER + 1)).toBe(false);
  });
});
