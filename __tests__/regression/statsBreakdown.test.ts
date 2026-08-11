/**
 * fillBuckets backs GET /api/v1/stats/breakdown's by_hour/by_weekday
 * series. pg returns EXTRACT(...) as numeric (a string), and a sparse
 * GROUP BY only has rows for hours/weekdays with actual sessions — this
 * guards both: the zero-fill for missing indexes, and the string->number
 * coercion pg requires.
 */
import { describe, it, expect } from 'vitest';
import { fillBuckets } from '../../src/services/StatsBreakdown.js';

describe('fillBuckets', () => {
  it('zero-fills every index in range, not just the ones with data', () => {
    const rows = [{ hour: 9, sessions: '2', seconds: '600' }];
    const result = fillBuckets(rows, 24, (r) => r.hour);

    expect(result).toHaveLength(24);
    expect(result[9]).toEqual({ index: 9, sessions: 2, seconds: 600 });
    expect(result[0]).toEqual({ index: 0, sessions: 0, seconds: 0 });
    expect(result[23]).toEqual({ index: 23, sessions: 0, seconds: 0 });
  });

  it('coerces numeric-as-string sessions/seconds to actual numbers', () => {
    const rows = [{ weekday: 3, sessions: '5', seconds: '1800' }];
    const result = fillBuckets(rows, 7, (r) => r.weekday);

    expect(typeof result[3].sessions).toBe('number');
    expect(typeof result[3].seconds).toBe('number');
    expect(result[3]).toEqual({ index: 3, sessions: 5, seconds: 1800 });
  });

  it('returns an all-zero series when there are no rows', () => {
    const result = fillBuckets([], 7, (r) => r.weekday);

    expect(result).toHaveLength(7);
    expect(result.every((b) => b.sessions === 0 && b.seconds === 0)).toBe(true);
  });
});
