/**
 * Characterizes the max-progress rejection policy from src/routes/progress.ts
 * before it's extracted into src/services/ProgressPolicy.ts. Locks in the
 * exact decision matrix (including the non-short-circuiting rule order,
 * where a later matching rule overwrites an earlier rule's rejected_reason)
 * so the extraction can't silently change behavior.
 */
import { describe, it, expect } from 'vitest';
import { decideProgressUpdate } from '../../src/services/ProgressPolicy.js';

describe('decideProgressUpdate', () => {
  it('allows the update when there is no prior progress', () => {
    expect(decideProgressUpdate(undefined, 5, 10)).toEqual({
      shouldUpdate: true,
      rejectedReason: null,
    });
  });

  it('allows forward progress into a new chapter', () => {
    const prev = { chapter_num: 5, percent: '80' };
    expect(decideProgressUpdate(prev, 6, 0)).toEqual({
      shouldUpdate: true,
      rejectedReason: null,
    });
  });

  it('allows higher percent within the same chapter', () => {
    const prev = { chapter_num: 5, percent: '40' };
    expect(decideProgressUpdate(prev, 5, 41)).toEqual({
      shouldUpdate: true,
      rejectedReason: null,
    });
  });

  it('rejects same chapter at a lower or equal percent', () => {
    const prev = { chapter_num: 5, percent: '40' };
    expect(decideProgressUpdate(prev, 5, 40)).toEqual({
      shouldUpdate: false,
      rejectedReason: 'same_chapter_lower_percent',
    });
    expect(decideProgressUpdate(prev, 5, 39)).toEqual({
      shouldUpdate: false,
      rejectedReason: 'same_chapter_lower_percent',
    });
  });

  it('rejects a chapter behind the last recorded one', () => {
    const prev = { chapter_num: 10, percent: '20' };
    expect(decideProgressUpdate(prev, 9, 0)).toEqual({
      shouldUpdate: false,
      rejectedReason: 'behind_chapter',
    });
  });

  it('rejects a same-chapter restart from significant progress back to near-zero', () => {
    // percent <= CHAPTER_RESTART_THRESHOLD_PERCENT (1) and
    // prev.percent > SIGNIFICANT_PROGRESS_THRESHOLD_PERCENT (10)
    const prev = { chapter_num: 5, percent: '50' };
    expect(decideProgressUpdate(prev, 5, 1)).toEqual({
      shouldUpdate: false,
      rejectedReason: 'chapter_restart_guard',
    });
  });

  it('does not treat a same-chapter dip as a restart when prior progress was insignificant', () => {
    const prev = { chapter_num: 5, percent: '5' };
    expect(decideProgressUpdate(prev, 5, 1)).toEqual({
      shouldUpdate: false,
      // same_chapter_lower_percent still fires (1 <= 5); restart_guard's
      // own condition (prev.percent > 10) doesn't hold, so it can't
      // overwrite the reason.
      rejectedReason: 'same_chapter_lower_percent',
    });
  });

  it('restart guard overwrites same_chapter_lower_percent when both conditions hold', () => {
    // percent (0) <= prev.percent (50) triggers same_chapter_lower_percent
    // first; restart guard's own condition also holds and, evaluated
    // after, overwrites the reason — this ordering is load-bearing and
    // must survive the extraction unchanged.
    const prev = { chapter_num: 5, percent: '50' };
    expect(decideProgressUpdate(prev, 5, 0)).toEqual({
      shouldUpdate: false,
      rejectedReason: 'chapter_restart_guard',
    });
  });
});
