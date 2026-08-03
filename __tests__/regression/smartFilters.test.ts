/**
 * Smart filter presets: Behind 5+, Updated this week, Almost caught up,
 * Stale reads. Pure predicates over the normalized Novel shape.
 */
import { describe, it, expect } from 'vitest';
import {
  isBehind,
  isFresh,
  isAlmostDone,
  isStale,
} from '../../frontend/src/lib/smartFilters.js';
import type { Novel, NovelStatus } from '../../frontend/src/types/index.js';

const NOW = new Date('2026-08-03T00:00:00Z');
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();

const novel = (over: Partial<Novel>): Novel =>
  ({
    novel_id: 'novelbin:x',
    title: 'X',
    status: 'reading' as NovelStatus,
    site_latest_chapter_time: null,
    chapters_updated_at: null,
    read_history: [],
    devices_reading: [],
    ...over,
  }) as Novel;

describe('isBehind', () => {
  it('flags a reading novel 5+ chapters behind', () => {
    expect(isBehind(novel({ latest_chapter: 100, latest_chapter_num: 105 }))).toBe(true);
  });
  it('ignores novels fewer than 5 behind', () => {
    expect(isBehind(novel({ latest_chapter: 100, latest_chapter_num: 104 }))).toBe(false);
  });
  it('ignores non-reading novels', () => {
    expect(
      isBehind(novel({ status: 'on-hold', latest_chapter: 1, latest_chapter_num: 99 })),
    ).toBe(false);
  });
});

describe('isFresh', () => {
  it('flags a release within 7 days', () => {
    expect(isFresh(novel({ site_latest_chapter_time: daysAgo(3) }), NOW)).toBe(true);
  });
  it('falls back to chapters_updated_at', () => {
    expect(isFresh(novel({ chapters_updated_at: daysAgo(2) }), NOW)).toBe(true);
  });
  it('ignores older releases and unknown dates', () => {
    expect(isFresh(novel({ site_latest_chapter_time: daysAgo(10) }), NOW)).toBe(false);
    expect(isFresh(novel({}), NOW)).toBe(false);
  });
});

describe('isAlmostDone', () => {
  it('flags reading novels within 2 chapters of latest', () => {
    expect(isAlmostDone(novel({ latest_chapter: 103, latest_chapter_num: 105 }))).toBe(true);
  });
  it('ignores novels further behind', () => {
    expect(isAlmostDone(novel({ latest_chapter: 100, latest_chapter_num: 105 }))).toBe(false);
  });
  it('uses percent when the site total is unknown', () => {
    expect(isAlmostDone(novel({ latest_chapter: 10, latest_percent: 92 }))).toBe(true);
    expect(isAlmostDone(novel({ latest_chapter: 10, latest_percent: 40 }))).toBe(false);
  });
});

describe('isStale', () => {
  it('flags reading novels untouched for 30+ days', () => {
    expect(isStale(novel({ latest_read_at: daysAgo(45) }), NOW)).toBe(true);
  });
  it('flags reading novels never touched at all', () => {
    expect(isStale(novel({}), NOW)).toBe(true);
  });
  it('ignores recently read or non-reading novels', () => {
    expect(isStale(novel({ latest_read_at: daysAgo(3) }), NOW)).toBe(false);
    expect(isStale(novel({ status: 'dropped', latest_read_at: daysAgo(90) }), NOW)).toBe(false);
  });
});
