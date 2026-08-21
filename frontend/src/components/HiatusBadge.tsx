import { useState } from 'react';
import type { Novel } from '../types/index.js';
import { HIATUS_DAYS, isLikelyHiatus } from '../lib/hiatus.js';

interface Props {
  novel: Novel;
}

/** "hiatus?" pill for reading novels with no release in 90 days. */
export function HiatusBadge({ novel }: Props) {
  const [now] = useState(() => new Date());
  if (!isLikelyHiatus(novel, now)) return null;
  const ref = novel.site_latest_chapter_time ?? novel.chapters_updated_at;
  const days = ref ? Math.floor((now.getTime() - new Date(ref).getTime()) / 86_400_000) : HIATUS_DAYS;
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
