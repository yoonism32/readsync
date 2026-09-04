import useSWR from 'swr';
import { Link } from 'react-router-dom';
import { swrFetcher } from '../api/client.js';
import { ClockIcon } from './Icon.js';
import { agoLabel, chapterLabel, formatDay, type OnThisDayEntry } from '../lib/onThisDay.js';

export function OnThisDay() {
  const { data, isLoading } = useSWR<{ entries: OnThisDayEntry[] }>(
    '/stats/on-this-day',
    swrFetcher,
  );

  // A quiet card: it has nothing to say on plenty of days, and a permanent
  // empty box on the dashboard is worse than no box. Hidden while loading and
  // when the library genuinely has no history near any anchor.
  if (isLoading || !data || data.entries.length === 0) return null;

  return (
    <div style={{ marginTop: 36 }}>
      <h2 style={{ fontSize: 'var(--text-xl)', fontWeight: 600, marginBottom: 4 }}>
        Around This Time
      </h2>
      <p className="text-muted" style={{ fontSize: 'var(--text-xs)', marginTop: 0, marginBottom: 14 }}>
        What you were reading at past milestones.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {data.entries.map((e, i) => (
          <Link
            key={`${e.months_ago}-${e.novel_id}-${e.date}`}
            to={`/novel/${encodeURIComponent(e.novel_id)}`}
            className="animate-fade-in panel row-interactive"
            style={{
              animationDelay: `${i * 40}ms`,
              borderRadius: 'var(--radius-lg)',
              padding: '12px 18px',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              textDecoration: 'none',
            }}
          >
            <ClockIcon size={15} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {e.title}
              </div>
              <div className="text-muted" style={{ fontSize: 'var(--text-xs)' }}>
                {agoLabel(e.months_ago)} · {formatDay(e.date)}
              </div>
            </div>
            <span className="text-muted tabular" style={{ fontSize: 'var(--text-xs)', flexShrink: 0 }}>
              {chapterLabel(e.min_chapter, e.max_chapter)}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
