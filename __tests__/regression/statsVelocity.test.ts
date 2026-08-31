import { describe, it, expect } from 'vitest';
import { computeVelocityTrend } from '../../src/services/StatsVelocity.js';

function daily(counts: number[]): { date: string; chapters_read: number }[] {
  return counts.map((chapters_read, i) => ({
    date: `2026-08-${String(i + 1).padStart(2, '0')}`,
    chapters_read,
  }));
}

describe('computeVelocityTrend', () => {
  it('splits a 14-day series into two 7-day windows and averages each', () => {
    const previous = [1, 1, 1, 1, 1, 1, 1]; // avg 1/day
    const current = [2, 2, 2, 2, 2, 2, 2]; // avg 2/day
    const result = computeVelocityTrend(daily([...previous, ...current]));

    expect(result.previous_avg_per_day).toBe(1);
    expect(result.current_avg_per_day).toBe(2);
    expect(result.trend_pct).toBe(100);
  });

  it('returns trend_pct null instead of Infinity when the prior window had zero activity', () => {
    const result = computeVelocityTrend(daily([0, 0, 0, 0, 0, 0, 0, 3, 3, 3, 3, 3, 3, 3]));

    expect(result.previous_avg_per_day).toBe(0);
    expect(result.current_avg_per_day).toBe(3);
    expect(result.trend_pct).toBeNull();
  });

  it('handles fewer than 7 days of data by treating the prior window as empty', () => {
    const result = computeVelocityTrend(daily([4, 6]));

    expect(result.previous_avg_per_day).toBe(0);
    expect(result.current_avg_per_day).toBe(5);
    expect(result.trend_pct).toBeNull();
  });

  it('rounds averages to 2 decimals, and computes trend from raw (unrounded) averages', () => {
    const result = computeVelocityTrend(
      daily([1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0]),
    );

    expect(result.previous_avg_per_day).toBe(0.43); // display value, rounded
    expect(result.current_avg_per_day).toBe(0.57); // display value, rounded
    // trend uses raw 3/7 vs 4/7, not the rounded 0.43/0.57 — rounding first
    // would compound error, so trend_pct is (4/7 - 3/7) / (3/7) = 33.3%.
    expect(result.trend_pct).toBe(33.3);
  });
});
