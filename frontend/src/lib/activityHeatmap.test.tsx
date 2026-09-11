import { describe, it, expect } from 'vitest';
import {
  buildCells,
  level,
  monthLabels,
  dedupeOverlappingLabels,
  formatDayDescription,
  DAYS,
} from './activityHeatmap.js';

describe('activity heatmap level thresholds', () => {
  it('buckets chapter counts into the 5 intensity levels', () => {
    expect(level(0)).toBe(0);
    expect(level(2)).toBe(1);
    expect(level(3)).toBe(2);
    expect(level(5)).toBe(2);
    expect(level(6)).toBe(3);
    expect(level(10)).toBe(3);
    expect(level(11)).toBe(4);
  });
});

describe('buildCells', () => {
  it('pads only the front of the grid, and covers exactly 365 consecutive real days', () => {
    const today = new Date(2026, 8, 9);
    const cells = buildCells(new Map(), today);
    const real = cells.filter(c => c.date !== null);
    const padCount = cells.length - real.length;

    expect(padCount).toBeGreaterThanOrEqual(0);
    expect(padCount).toBeLessThan(7);
    expect(cells.slice(0, padCount).every(c => c.date === null)).toBe(true);
    expect(real.length).toBe(DAYS);
    expect(new Set(real.map(c => c.date)).size).toBe(DAYS);
  });

  it('pulls chapter counts from byDate (keyed by the same date strings buildCells emits) and defaults missing days to zero', () => {
    const today = new Date(2026, 8, 9);
    const probe = buildCells(new Map(), today);
    const lastDate = probe[probe.length - 1].date!;
    const secondLastDate = probe[probe.length - 2].date!;

    const byDate = new Map([[lastDate, 4]]);
    const cells = buildCells(byDate, today);
    expect(cells[cells.length - 1].chapters).toBe(4);
    expect(cells[cells.length - 2].chapters).toBe(0);
    expect(secondLastDate).not.toBe(lastDate);
  });
});

describe('monthLabels + dedupeOverlappingLabels', () => {
  it('places a label at the first real cell and at every month start, across a year boundary', () => {
    // Window Sep 2025 -> Sep 2026 crosses Dec -> Jan.
    const cells = buildCells(new Map(), new Date(2026, 8, 9));
    const labels = monthLabels(cells);

    // A 365-day window spans 12 full months plus a partial one, so it
    // legitimately revisits one month name a year apart (e.g. two
    // Septembers) — that's expected, not a bug.
    expect(labels.length).toBeGreaterThanOrEqual(12);
    expect(labels.length).toBeLessThanOrEqual(14);
    const dec = labels.find(l => l.label === 'Dec');
    const jan = labels.find(l => l.label === 'Jan');
    expect(dec).toBeDefined();
    expect(jan).toBeDefined();
    expect(jan!.col).toBeGreaterThan(dec!.col);
    // Columns strictly increase — no backward jump, no adjacent repeat.
    for (let i = 1; i < labels.length; i++) {
      expect(labels[i].col).toBeGreaterThan(labels[i - 1].col);
      if (labels[i].col - labels[i - 1].col < 4) {
        expect(labels[i].label).not.toBe(labels[i - 1].label);
      }
    }
  });

  it('drops a label that lands too close to the previous one, keeps it when there is room', () => {
    const labels = [{ col: 0, label: 'Jan' }, { col: 4, label: 'Feb' }, { col: 9, label: 'Mar' }];
    expect(dedupeOverlappingLabels(labels, 2).map(l => l.label)).toEqual(['Jan', 'Feb', 'Mar']);
    expect(dedupeOverlappingLabels(labels, 5).map(l => l.label)).toEqual(['Jan', 'Mar']);
  });
});

describe('formatDayDescription', () => {
  it('reports an explicit zero-activity day', () => {
    expect(formatDayDescription('2026-09-08', 0)).toBe('September 8, 2026: no chapters read');
  });

  it('singularizes one chapter and pluralizes the rest', () => {
    expect(formatDayDescription('2026-09-09', 1)).toBe('September 9, 2026: 1 chapter');
    expect(formatDayDescription('2026-09-09', 3)).toBe('September 9, 2026: 3 chapters');
  });

  it('does not shift the date across a UTC day boundary', () => {
    // A naive `new Date(iso)` parse (UTC midnight) would render as Dec 31 in
    // any timezone behind UTC. The local-time constructor must not do that.
    expect(formatDayDescription('2026-01-01', 2)).toBe('January 1, 2026: 2 chapters');
  });
});
