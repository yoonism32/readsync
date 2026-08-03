import type { Novel } from '../types/index.js';

/** Chapters released beyond the user's last-read chapter (0 when unknown). */
export function behindCount(novel: Novel): number {
  if (novel.latest_chapter == null || novel.latest_chapter_num == null) return 0;
  return Math.max(0, novel.latest_chapter_num - novel.latest_chapter);
}

interface Props {
  novel: Novel;
}

/** "N new" pill shown when unread chapters exist. Renders nothing at 0. */
export function BehindBadge({ novel }: Props) {
  const behind = behindCount(novel);
  if (behind === 0) return null;
  return (
    <span
      title={`${behind} unread chapter${behind === 1 ? '' : 's'}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        borderRadius: 999,
        padding: '1px 8px',
        fontSize: 'var(--text-xs)',
        fontWeight: 600,
        background: 'var(--color-gold-glow)',
        color: 'var(--color-gold-bright)',
        border: '1px solid var(--color-gold-border)',
        whiteSpace: 'nowrap',
      }}
    >
      {behind} new
    </span>
  );
}
