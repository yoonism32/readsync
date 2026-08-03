/**
 * Four-tier read status (legacy MyList dot legend): caught-up (blue),
 * new/manageable 1-10 (glowing green), behind 11-50 (amber),
 * way-behind 50+ (red), unknown when the site chapter count is missing.
 */
import { describe, it, expect } from 'vitest';
import { statusTier } from '../../frontend/src/components/BehindBadge.js';
import type { Novel, NovelStatus } from '../../frontend/src/types/index.js';

const novel = (over: Partial<Novel>): Novel =>
  ({
    novel_id: 'novelbin:x',
    title: 'X',
    status: 'reading' as NovelStatus,
    read_history: [],
    devices_reading: [],
    ...over,
  }) as Novel;

describe('statusTier', () => {
  it('is unknown with no site chapter count', () => {
    expect(statusTier(novel({ latest_chapter_num: null, latest_chapter: 5 }))).toBe('unknown');
    expect(statusTier(novel({ latest_chapter_num: 0, latest_chapter: 5 }))).toBe('unknown');
  });

  it('is caught-up at zero unread', () => {
    expect(statusTier(novel({ latest_chapter_num: 100, latest_chapter: 100 }))).toBe('caught-up');
  });

  it('is new for 1-10 unread', () => {
    expect(statusTier(novel({ latest_chapter_num: 105, latest_chapter: 100 }))).toBe('new');
    expect(statusTier(novel({ latest_chapter_num: 110, latest_chapter: 100 }))).toBe('new');
  });

  it('is behind for 11-50 unread', () => {
    expect(statusTier(novel({ latest_chapter_num: 111, latest_chapter: 100 }))).toBe('behind');
    expect(statusTier(novel({ latest_chapter_num: 150, latest_chapter: 100 }))).toBe('behind');
  });

  it('is way-behind past 50 unread', () => {
    expect(statusTier(novel({ latest_chapter_num: 151, latest_chapter: 100 }))).toBe('way-behind');
  });
});
