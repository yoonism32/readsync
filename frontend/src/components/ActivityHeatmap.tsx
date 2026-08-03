import useSWR from 'swr';
import { swrFetcher } from '../api/client.js';
import { computeStreaks } from '../lib/streaks.js';
import type { DailyActivity } from '../lib/streaks.js';

interface DailyRow extends DailyActivity {
  session_seconds: number;
}

const DAYS = 365;
const CELL = 11;
const GAP = 3;

function level(chapters: number): number {
  if (chapters <= 0) return 0;
  if (chapters <= 2) return 1;
  if (chapters <= 5) return 2;
  if (chapters <= 10) return 3;
  return 4;
}

const LEVEL_BG = [
  'rgba(255,255,255,0.05)',
  'rgba(201,168,76,0.25)',
  'rgba(201,168,76,0.45)',
  'rgba(201,168,76,0.7)',
  'var(--color-gold-bright)',
];

export function ActivityHeatmap() {
  const { data } = useSWR<DailyRow[]>(`/stats/daily?days=${DAYS}`, swrFetcher, {
    revalidateOnFocus: false,
  });

  if (!data || data.length === 0) return null;

  const byDate = new Map(data.map(d => [d.date.slice(0, 10), d]));
  const streaks = computeStreaks(data);
  const totalChapters = data.reduce((sum, d) => sum + Number(d.chapters_read), 0);

  // GitHub layout: columns are weeks, rows are Sun..Sat. Pad the first
  // column so the grid starts on a Sunday.
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - DAYS + 1);
  const startPad = start.getDay();

  const cells: { key: string; date: string | null; chapters: number }[] = [];
  for (let i = 0; i < startPad; i++) cells.push({ key: `pad-${i}`, date: null, chapters: 0 });
  const cursor = new Date(start);
  while (cursor <= end) {
    const iso = cursor.toISOString().slice(0, 10);
    cells.push({
      key: iso,
      date: iso,
      chapters: Number(byDate.get(iso)?.chapters_read ?? 0),
    });
    cursor.setDate(cursor.getDate() + 1);
  }

  return (
    <div className="glass" style={{ borderRadius: 'var(--radius-xl)', padding: 20, marginBottom: 32 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 600 }}>Reading Activity</h2>
        <span className="text-muted tabular" style={{ fontSize: 'var(--text-xs)' }}>
          {totalChapters} chapters this year
        </span>
        <span style={{ flex: 1 }} />
        <span className="tabular" style={{ fontSize: 'var(--text-xs)', color: 'var(--color-gold)' }}>
          🔥 {streaks.current} day streak
        </span>
        <span className="text-muted tabular" style={{ fontSize: 'var(--text-xs)' }}>
          best {streaks.longest}
        </span>
      </div>

      <div style={{ overflowX: 'auto', paddingBottom: 4 }}>
        <div
          style={{
            display: 'grid',
            gridAutoFlow: 'column',
            gridTemplateRows: `repeat(7, ${CELL}px)`,
            gap: GAP,
            width: 'max-content',
          }}
        >
          {cells.map(c =>
            c.date === null ? (
              <div key={c.key} style={{ width: CELL, height: CELL }} />
            ) : (
              <div
                key={c.key}
                title={`${c.date}: ${c.chapters} chapter${c.chapters === 1 ? '' : 's'}`}
                style={{
                  width: CELL,
                  height: CELL,
                  borderRadius: 2,
                  background: LEVEL_BG[level(c.chapters)],
                }}
              />
            )
          )}
        </div>
      </div>

      <div className="text-faint" style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 8, fontSize: 'var(--text-xs)' }}>
        Less
        {LEVEL_BG.map((bg, i) => (
          <span key={i} style={{ width: 10, height: 10, borderRadius: 2, background: bg, display: 'inline-block' }} />
        ))}
        More
      </div>
    </div>
  );
}
