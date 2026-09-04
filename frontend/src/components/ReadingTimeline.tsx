import useSWR from 'swr';
import { swrFetcher } from '../api/client.js';
import {
  buildPath,
  spanLabel,
  TIMELINE_HEIGHT,
  TIMELINE_WIDTH,
  type TimelinePoint,
} from '../lib/readingTimeline.js';

interface NovelStats {
  timeline: TimelinePoint[];
}

export function ReadingTimeline({ novelId }: { novelId: string }) {
  const { data, isLoading } = useSWR<NovelStats>(
    `/stats/novels/${encodeURIComponent(novelId)}`,
    swrFetcher,
  );

  const points = data?.timeline ?? [];
  // Two points is the minimum that can express a slope; below that there is
  // no shape to show and the card would just be a dot.
  if (isLoading || points.length < 2) return null;

  const path = buildPath(points);
  const label = spanLabel(points);

  return (
    <div className="panel" style={{ borderRadius: 'var(--radius-lg)', padding: '16px 18px', marginTop: 20 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 12 }}>
        <h2 style={{ fontSize: 'var(--text-base)', fontWeight: 600, margin: 0 }}>Reading Timeline</h2>
        <span className="text-muted" style={{ fontSize: 'var(--text-xs)' }}>{label}</span>
      </div>

      <svg
        viewBox={`0 0 ${TIMELINE_WIDTH} ${TIMELINE_HEIGHT}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`Reading timeline: ${label}. Steep sections are binges, flat sections are pauses.`}
        style={{ display: 'block', width: '100%', height: TIMELINE_HEIGHT, overflow: 'visible' }}
      >
        <path d={path} fill="none" stroke="var(--color-teal)" strokeWidth={2}
          strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>

      <div className="text-faint" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, marginTop: 6 }}>
        <span>Ch. {points[0].chapter_num}</span>
        <span>Ch. {points[points.length - 1].chapter_num}</span>
      </div>
    </div>
  );
}
