/**
 * Streak semantics (StoryGraph model): consecutive active days; an
 * activity-free today doesn't break the streak until the day is over.
 */
import { describe, it, expect } from 'vitest';
import { computeStreaks } from '../../frontend/src/lib/streaks.js';

const NOW = new Date('2026-08-03T12:00:00Z');
const day = (offset: number, chapters: number) => {
  const d = new Date(NOW);
  d.setUTCDate(d.getUTCDate() - offset);
  return { date: d.toISOString().slice(0, 10), chapters_read: chapters };
};

describe('computeStreaks', () => {
  it('counts a run ending today', () => {
    const s = computeStreaks([day(2, 3), day(1, 1), day(0, 5)], NOW);
    expect(s.current).toBe(3);
    expect(s.longest).toBe(3);
  });

  it('keeps the streak alive when today has no activity yet', () => {
    const s = computeStreaks([day(2, 3), day(1, 1), day(0, 0)], NOW);
    expect(s.current).toBe(2);
  });

  it('resets after a fully missed day', () => {
    const s = computeStreaks([day(3, 4), day(2, 0), day(1, 0), day(0, 2)], NOW);
    expect(s.current).toBe(1);
    expect(s.longest).toBe(1);
  });

  it('tracks the longest historical run separately', () => {
    const s = computeStreaks(
      [day(9, 1), day(8, 1), day(7, 1), day(6, 1), day(5, 0), day(1, 1), day(0, 1)],
      NOW
    );
    expect(s.current).toBe(2);
    expect(s.longest).toBe(4);
  });

  it('handles empty input', () => {
    expect(computeStreaks([], NOW)).toEqual({ current: 0, longest: 0 });
  });
});
