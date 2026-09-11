// Calendar/data positioning for the reading-activity heatmap. Kept separate
// from the component (same split as lib/readingTimeline.ts) so the
// date/grid math is unit-testable without rendering anything.

export const DAYS = 365;
// ceil(365/7) = 53 — the widest a Sun-padded 365-day window can span.
export const WEEKS = 53;

export interface Cell {
  key: string;
  date: string | null;
  chapters: number;
}

export interface MonthLabel {
  col: number;
  label: string;
}

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

const MONTH_NAMES_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Row indices are 0=Sunday..6=Saturday, matching the pad/grid ordering
// below. GitHub's Mon/Wed/Fri labels sit at exactly these rows under a
// Sunday-first layout.
export const WEEKDAY_LABELS: { row: number; label: string }[] = [
  { row: 1, label: 'Mon' },
  { row: 3, label: 'Wed' },
  { row: 5, label: 'Fri' },
];

export function level(chapters: number): number {
  if (chapters <= 0) return 0;
  if (chapters <= 2) return 1;
  if (chapters <= 5) return 2;
  if (chapters <= 10) return 3;
  return 4;
}

/**
 * Rolling 365-day window ending today, padded so the first column starts on
 * a Sunday (GitHub layout: columns are weeks, rows are Sun..Sat).
 */
export function buildCells(byDate: Map<string, number>, today: Date = new Date()): Cell[] {
  const end = new Date(today);
  const start = new Date(end);
  start.setDate(start.getDate() - DAYS + 1);
  const startPad = start.getDay();

  const cells: Cell[] = [];
  for (let i = 0; i < startPad; i++) cells.push({ key: `pad-${i}`, date: null, chapters: 0 });

  const cursor = new Date(start);
  while (cursor <= end) {
    // The API and the grid both use local calendar dates. Converting local
    // midnight through UTC can repeat a key across a daylight-saving change.
    const iso = localDateKey(cursor);
    cells.push({ key: iso, date: iso, chapters: byDate.get(iso) ?? 0 });
    cursor.setDate(cursor.getDate() + 1);
  }

  return cells;
}

/**
 * A candidate label at the week-column of every real cell that starts a
 * calendar month (plus the very first real cell, for a partial opening
 * month). Reads the actual date, so a rolling window crossing Dec→Jan needs
 * no special-casing.
 */
export function monthLabels(cells: Cell[]): MonthLabel[] {
  const labels: MonthLabel[] = [];
  let seenFirstReal = false;

  cells.forEach((cell, i) => {
    if (cell.date === null) return;
    const d = isoToLocalDate(cell.date);
    const isFirstReal = !seenFirstReal;
    seenFirstReal = true;
    if (isFirstReal || d.getDate() === 1) {
      labels.push({ col: Math.floor(i / 7), label: MONTH_NAMES[d.getMonth()] });
    }
  });

  return labels;
}

/** Drops a label that lands fewer than `minColGap` columns after the previous kept one. */
export function dedupeOverlappingLabels(labels: MonthLabel[], minColGap: number): MonthLabel[] {
  const kept: MonthLabel[] = [];
  for (const label of labels) {
    const prev = kept[kept.length - 1];
    if (!prev || label.col - prev.col >= minColGap) kept.push(label);
  }
  return kept;
}

function isoToLocalDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function formatDayDescription(iso: string, chapters: number): string {
  const d = isoToLocalDate(iso);
  const formatted = `${MONTH_NAMES_LONG[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
  if (chapters <= 0) return `${formatted}: no chapters read`;
  return `${formatted}: ${chapters} chapter${chapters === 1 ? '' : 's'}`;
}
