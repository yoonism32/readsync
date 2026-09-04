export interface TimelinePoint {
  chapter_num: number;
  first_read: string;
}

export const TIMELINE_WIDTH = 600;
export const TIMELINE_HEIGHT = 90;

/**
 * Chapter number over time. Slope *is* the reading pace — a near-vertical run
 * is a binge, a flat stretch is a hiatus — which is the one thing a progress
 * bar can never show, since it only ever knows where you are now.
 */
export function buildPath(points: TimelinePoint[]): string {
  if (points.length < 2) return '';

  const times = points.map(p => new Date(p.first_read).getTime());
  const chapters = points.map(p => p.chapter_num);
  const tMin = Math.min(...times);
  const tMax = Math.max(...times);
  const cMin = Math.min(...chapters);
  const cMax = Math.max(...chapters);
  // Guard both spans: a novel read entirely within one timestamp, or one
  // sitting on a single chapter, would divide by zero and emit NaN commands
  // that silently blank the whole SVG.
  const tSpan = tMax - tMin || 1;
  const cSpan = cMax - cMin || 1;

  return points
    .map((_p, i) => {
      const x = ((times[i] - tMin) / tSpan) * TIMELINE_WIDTH;
      const y = TIMELINE_HEIGHT - ((chapters[i] - cMin) / cSpan) * TIMELINE_HEIGHT;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

export function spanLabel(points: TimelinePoint[]): string {
  const times = points.map(p => new Date(p.first_read).getTime());
  const days = Math.max(1, Math.round((Math.max(...times) - Math.min(...times)) / 86_400_000));
  const chapters = points.length;
  const perDay = chapters / days;
  const rate = perDay >= 10 ? `${Math.round(perDay)}/day` : `${perDay.toFixed(1)}/day`;
  return `${chapters} chapters over ${days} day${days === 1 ? '' : 's'} · ${rate}`;
}
