import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import useSWR from 'swr';
import { swrFetcher } from '../api/client.js';
import { DeviceBadge } from '../components/DeviceBadge.js';
import { Spinner } from '../components/Spinner.js';

interface HistoryRow {
  date: string;
  novel_id: string;
  title: string;
  from_chapter: number;
  to_chapter: number;
  max_percent: string | number;
  events: string | number;
  devices: string[];
  last_event: string;
  read_through: number;
}

const RANGE_OPTIONS = [7, 30, 90, 365] as const;

function dayLabel(iso: string, now: Date): string {
  const d = iso.slice(0, 10);
  const today = now.toISOString().slice(0, 10);
  const yesterday = new Date(now.getTime() - 86_400_000).toISOString().slice(0, 10);
  if (d === today) return 'Today';
  if (d === yesterday) return 'Yesterday';
  return new Date(`${d}T00:00:00`).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function chapterSpan(row: HistoryRow): string {
  if (row.from_chapter === row.to_chapter) return `Ch. ${row.to_chapter}`;
  return `Ch. ${row.from_chapter} → ${row.to_chapter}`;
}

export function History() {
  const [days, setDays] = useState<number>(30);
  const { data, isLoading } = useSWR<HistoryRow[]>(
    `/history?days=${days}`,
    swrFetcher,
    { revalidateOnFocus: false },
  );

  const grouped = useMemo(() => {
    const byDay = new Map<string, HistoryRow[]>();
    for (const row of data ?? []) {
      const key = row.date.slice(0, 10);
      const list = byDay.get(key);
      if (list) list.push(row);
      else byDay.set(key, [row]);
    }
    return [...byDay.entries()];
  }, [data]);

  const now = new Date();

  return (
    <div className="animate-fade-in">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 24 }}>
        <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 700 }}>History</h1>
        <span style={{ flex: 1 }} />
        <div style={{ display: 'flex', gap: 4 }}>
          {RANGE_OPTIONS.map(d => (
            <button
              key={d}
              onClick={() => setDays(d)}
              aria-pressed={days === d}
              style={{
                padding: '4px 12px',
                borderRadius: 'var(--radius-full)',
                border: days === d ? '1px solid var(--color-border-gold)' : '1px solid var(--color-border)',
                background: days === d ? 'var(--color-gold-glow)' : 'transparent',
                color: days === d ? 'var(--color-gold)' : 'var(--color-text-muted)',
                fontSize: 'var(--text-xs)',
                cursor: 'pointer',
                transition: 'all 0.15s',
                touchAction: 'manipulation',
              }}
            >
              {d === 365 ? '1y' : `${d}d`}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}><Spinner size={32} /></div>
      ) : grouped.length === 0 ? (
        <div className="glass" style={{ borderRadius: 'var(--radius-xl)', padding: '48px 24px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
          No reading activity in this period.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {grouped.map(([day, rows], gi) => (
            <section key={day} className="animate-fade-in" style={{ animationDelay: `${Math.min(gi * 40, 240)}ms` }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 8 }}>
                <h2 style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-gold)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  {dayLabel(day, now)}
                </h2>
                <span className="text-faint tabular" style={{ fontSize: 'var(--text-xs)' }}>
                  {rows.length} novel{rows.length === 1 ? '' : 's'}
                </span>
              </div>

              <div className="glass" style={{ borderRadius: 'var(--radius-xl)', padding: '4px 16px' }}>
                {rows.map((row, i) => (
                  <div
                    key={`${row.novel_id}-${i}`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '10px 0',
                      borderBottom: i < rows.length - 1 ? '1px solid var(--color-border)' : 'none',
                      flexWrap: 'wrap',
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 160 }}>
                      <Link
                        to={`/novel/${encodeURIComponent(row.novel_id)}`}
                        style={{ fontWeight: 600, fontSize: 'var(--text-sm)', color: 'var(--color-text)', textDecoration: 'none', transition: 'color 0.15s' }}
                        onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-gold)')}
                        onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-text)')}
                      >
                        {row.title}
                      </Link>
                      {row.read_through > 1 && (
                        <span className="text-faint" style={{ fontSize: 'var(--text-xs)', marginLeft: 8 }}>
                          re-read #{row.read_through}
                        </span>
                      )}
                    </div>

                    <span className="tabular" style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', flexShrink: 0 }}>
                      {chapterSpan(row)}
                      <span className="text-faint"> · {Math.round(Number(row.max_percent))}%</span>
                    </span>

                    <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                      {row.devices.map(d => (
                        <DeviceBadge key={d} label={d} />
                      ))}
                    </div>

                    <span className="text-faint tabular" style={{ fontSize: 'var(--text-xs)', flexShrink: 0, minWidth: 52, textAlign: 'right' }}>
                      {new Date(row.last_event).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
