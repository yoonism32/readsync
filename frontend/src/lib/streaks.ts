// Daily streak math over the /stats/daily series.

export interface DailyActivity {
  /** ISO date (yyyy-mm-dd or full timestamp) */
  date: string;
  chapters_read: number;
}

export interface Streaks {
  current: number;
  longest: number;
}

const dayKey = (d: string): string => d.slice(0, 10);

/**
 * Current streak counts consecutive active days ending today — or ending
 * yesterday when today has no activity yet (an in-progress day doesn't
 * break the streak until it's fully missed).
 */
export function computeStreaks(days: DailyActivity[], today: Date = new Date()): Streaks {
  const active = new Set(days.filter(d => Number(d.chapters_read) > 0).map(d => dayKey(d.date)));

  let longest = 0;
  let run = 0;
  const sorted = [...days].sort((a, b) => dayKey(a.date).localeCompare(dayKey(b.date)));
  for (const d of sorted) {
    if (active.has(dayKey(d.date))) {
      run += 1;
      if (run > longest) longest = run;
    } else {
      run = 0;
    }
  }

  const iso = (t: Date): string => t.toISOString().slice(0, 10);
  const cursor = new Date(today);
  if (!active.has(iso(cursor))) cursor.setUTCDate(cursor.getUTCDate() - 1);
  let current = 0;
  while (active.has(iso(cursor))) {
    current += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }

  return { current, longest: Math.max(longest, current) };
}
