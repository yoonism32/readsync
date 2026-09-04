export interface OnThisDayEntry {
  months_ago: number;
  /** The date actually matched — anchors are matched over a ±3 day window,
   *  so this is rarely the exact anniversary. See the route comment. */
  date: string;
  novel_id: string;
  title: string;
  min_chapter: number;
  max_chapter: number;
  snapshots: number;
}

export function agoLabel(months: number): string {
  if (months === 12) return 'A year ago';
  if (months === 24) return 'Two years ago';
  if (months === 1) return 'A month ago';
  return `${months} months ago`;
}

export function chapterLabel(min: number, max: number): string {
  return min === max ? `Ch. ${min}` : `Ch. ${min}–${max}`;
}

export function formatDay(iso: string): string {
  // Parsed as UTC noon so a date-only string can't slip to the previous day
  // in a negative-offset timezone.
  const d = new Date(`${iso}T12:00:00Z`);
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}
