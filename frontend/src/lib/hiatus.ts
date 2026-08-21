import type { Novel } from '../types/index.js';

export const HIATUS_DAYS = 90;

/**
 * A reading-status novel whose site hasn't released a chapter in
 * HIATUS_DAYS is likely on hiatus. Uses the scraped release time,
 * falling back to when we last saw the chapter count change.
 */
export function isLikelyHiatus(novel: Novel, now: Date = new Date()): boolean {
  if (novel.status !== 'reading') return false;
  const ref = novel.site_latest_chapter_time ?? novel.chapters_updated_at;
  if (!ref) return false;
  const t = new Date(ref).getTime();
  if (Number.isNaN(t)) return false;
  return now.getTime() - t > HIATUS_DAYS * 24 * 60 * 60 * 1000;
}
