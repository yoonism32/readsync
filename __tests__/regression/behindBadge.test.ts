/**
 * Chapters-behind badge logic: the count is latest site chapter minus the
 * user's frontier, floored at zero, and 0 whenever either side is unknown.
 */
import { describe, it, expect } from 'vitest';
import { behindCount } from '../../frontend/src/lib/behindStatus.js';
import type { Novel } from '../../frontend/src/types/index.js';

const base = {
  novel_id: 'novelbin:x',
  title: 'X',
  primary_url: null,
  author: null,
  genre: null,
  status: 'reading',
  favorite: false,
  rating: 0,
  notes: null,
  latest_chapter_title: null,
  chapters_updated_at: null,
  site_latest_chapter_time: null,
  site_latest_chapter_time_raw: null,
  last_activity: null,
  started_at: null,
  completed_at: null,
  current_read_through: 1,
  read_history: [],
  latest_url: null,
  latest_device_id: null,
  latest_device_label: null,
  latest_read_at: null,
  latest_percent: null,
  devices_reading: [],
} satisfies Partial<Novel>;

const novel = (latest_chapter: number | null, latest_chapter_num: number | null): Novel =>
  ({ ...base, latest_chapter, latest_chapter_num } as Novel);

describe('behindCount', () => {
  it('counts unread chapters', () => {
    expect(behindCount(novel(1204, 1216))).toBe(12);
  });
  it('is zero when caught up', () => {
    expect(behindCount(novel(1216, 1216))).toBe(0);
  });
  it('floors at zero when user is ahead of stale site metadata', () => {
    expect(behindCount(novel(1220, 1216))).toBe(0);
  });
  it('is zero when either side is unknown', () => {
    expect(behindCount(novel(null, 1216))).toBe(0);
    expect(behindCount(novel(1204, null))).toBe(0);
  });
});
