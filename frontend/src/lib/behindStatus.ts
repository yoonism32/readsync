import type { Novel } from '../types/index.js';

/** Chapters released beyond the user's last-read chapter (0 when unknown). */
export function behindCount(novel: Novel): number {
  if (novel.latest_chapter == null || novel.latest_chapter_num == null) return 0;
  return Math.max(0, novel.latest_chapter_num - novel.latest_chapter);
}

export type StatusTier = 'unknown' | 'caught-up' | 'new' | 'behind' | 'way-behind';

/** Four-tier read status, by unread-chapter count. */
export function statusTier(novel: Novel): StatusTier {
  if (!novel.latest_chapter_num) return 'unknown';
  const behind = behindCount(novel);
  if (behind === 0) return 'caught-up';
  if (behind <= 10) return 'new';
  if (behind <= 50) return 'behind';
  return 'way-behind';
}
