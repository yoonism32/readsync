/**
 * Hiatus detection: reading-status novels with no site release in 90 days
 * get flagged. Falls back from site_latest_chapter_time to
 * chapters_updated_at; anything non-reading or unknown is never flagged.
 */
import { describe, it, expect } from 'vitest';
import { isLikelyHiatus } from '../../frontend/src/components/HiatusBadge.js';
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
  } as Novel);

describe('isLikelyHiatus', () => {
  it('flags a reading novel with no release in over 90 days', () => {
    expect(isLikelyHiatus(novel({ site_latest_chapter_time: daysAgo(120) }), NOW)).toBe(true);
  });
  it('does not flag recent releases', () => {
    expect(isLikelyHiatus(novel({ site_latest_chapter_time: daysAgo(5) }), NOW)).toBe(false);
  });
  it('90 days exactly is not yet hiatus', () => {
    expect(isLikelyHiatus(novel({ site_latest_chapter_time: daysAgo(90) }), NOW)).toBe(false);
  });
  it('falls back to chapters_updated_at', () => {
    expect(isLikelyHiatus(novel({ chapters_updated_at: daysAgo(200) }), NOW)).toBe(true);
  });
  it('never flags non-reading statuses or unknown dates', () => {
    expect(isLikelyHiatus(novel({ status: 'completed' as NovelStatus, site_latest_chapter_time: daysAgo(400) }), NOW)).toBe(false);
    expect(isLikelyHiatus(novel({}), NOW)).toBe(false);
  });
});
