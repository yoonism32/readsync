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

const TIER_COLOR: Record<StatusTier, string> = {
  unknown: 'var(--color-success)',
  'caught-up': 'var(--color-info)',
  new: 'var(--color-success)',
  behind: 'var(--color-warning)',
  'way-behind': 'var(--color-danger)',
};

const TIER_LABEL: Record<StatusTier, string> = {
  unknown: 'No chapter data yet',
  'caught-up': 'Caught up',
  new: 'New chapters available',
  behind: 'Behind',
  'way-behind': 'Way behind',
};

/** Small colored status dot — green glow when caught up on new chapters,
 *  blue caught up, amber behind, red way behind. */
export function StatusDot({ novel }: { novel: Novel }) {
  const tier = statusTier(novel);
  const glow = tier === 'new' || tier === 'unknown';
  return (
    <span
      title={TIER_LABEL[tier]}
      aria-hidden="true"
      style={{
        display: 'inline-block',
        width: 6,
        height: 6,
        borderRadius: 999,
        background: TIER_COLOR[tier],
        boxShadow: glow ? `0 0 6px ${TIER_COLOR[tier]}` : 'none',
        flexShrink: 0,
      }}
    />
  );
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
