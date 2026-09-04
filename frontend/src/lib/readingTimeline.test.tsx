import { describe, it, expect } from 'vitest';
import { buildPath, spanLabel, type TimelinePoint } from './readingTimeline.js';

function pt(chapter_num: number, iso: string): TimelinePoint {
  return { chapter_num, first_read: iso };
}

describe('ReadingTimeline geometry', () => {
  it('emits nothing for fewer than two points — there is no slope to draw', () => {
    expect(buildPath([])).toBe('');
    expect(buildPath([pt(1, '2026-01-01T00:00:00Z')])).toBe('');
  });

  it('spans the full viewbox from first to last point', () => {
    const path = buildPath([
      pt(1, '2026-01-01T00:00:00Z'),
      pt(101, '2026-01-11T00:00:00Z'),
    ]);
    // Chapter rises, so y falls: starts bottom-left, ends top-right.
    expect(path).toBe('M0.0,90.0 L600.0,0.0');
  });

  // A novel binged inside one timestamp, or one sitting on a single chapter,
  // would divide by zero and emit NaN commands that blank the whole SVG.
  it('never emits NaN when the time span is zero', () => {
    const path = buildPath([
      pt(1, '2026-01-01T00:00:00Z'),
      pt(2, '2026-01-01T00:00:00Z'),
    ]);
    expect(path).not.toMatch(/NaN/);
  });

  it('never emits NaN when the chapter span is zero', () => {
    const path = buildPath([
      pt(5, '2026-01-01T00:00:00Z'),
      pt(5, '2026-01-05T00:00:00Z'),
    ]);
    expect(path).not.toMatch(/NaN/);
  });

  it('reports the span and rate', () => {
    // 696 chapters over 5 days — the real shape of a binge in this library.
    const points = Array.from({ length: 696 }, (_, i) =>
      pt(i + 1, new Date(Date.UTC(2026, 0, 19) + (i / 695) * 5 * 86_400_000).toISOString()));
    expect(spanLabel(points)).toBe('696 chapters over 5 days · 139/day');
  });

  it('uses one decimal for slow reads and singularises a one-day span', () => {
    const points = [
      pt(1, '2026-01-01T00:00:00Z'),
      pt(2, '2026-01-01T12:00:00Z'),
    ];
    expect(spanLabel(points)).toBe('2 chapters over 1 day · 2.0/day');
  });
});
