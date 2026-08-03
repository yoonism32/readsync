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

interface Props {
  novel: Novel;
}

/** "hiatus?" pill for reading novels with no release in 90 days. */
export function HiatusBadge({ novel }: Props) {
  if (!isLikelyHiatus(novel)) return null;
  const ref = novel.site_latest_chapter_time ?? novel.chapters_updated_at;
  const days = ref ? Math.floor((Date.now() - new Date(ref).getTime()) / 86_400_000) : HIATUS_DAYS;
  return (
    <span
      title={`No new chapter in ${days} days`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        borderRadius: 999,
        padding: '1px 8px',
        fontSize: 'var(--text-xs)',
        fontWeight: 600,
        background: 'var(--color-warning-dim)',
        color: 'var(--color-warning)',
        whiteSpace: 'nowrap',
      }}
    >
      hiatus?
    </span>
  );
}
