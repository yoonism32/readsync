/**
 * Regression test: realChapterCount used to be a single module-level
 * variable shared across every novel a session touched. On an SPA route
 * change to a *different* novel (no full page reload), the previous novel's
 * fetched count leaked in as a stale candidate for the new novel. Fixed by
 * keying the cache per novel slug (see ChapterDetector.ts).
 */
import { describe, expect, it } from 'vitest';
import {
  getCachedRealChapterCount,
  setCachedRealChapterCount,
} from '../src/services/ChapterDetector.js';

describe('real chapter count cache', () => {
  it('returns null for a novel that has never been cached', () => {
    expect(getCachedRealChapterCount('never-seen-novel')).toBeNull();
  });

  it('does not leak one novel\'s cached count into a different novel\'s lookup', () => {
    setCachedRealChapterCount('novel-a', 342);

    expect(getCachedRealChapterCount('novel-a')).toBe(342);
    expect(getCachedRealChapterCount('novel-b')).toBeNull();
  });
});
