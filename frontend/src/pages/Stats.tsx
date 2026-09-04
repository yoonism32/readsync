import { useState } from 'react';
import useSWR from 'swr';
import { swrFetcher } from '../api/client.js';
import { Spinner } from '../components/Spinner.js';
import { SmartphoneIcon, MonitorIcon } from '../components/Icon.js';
import { useCountUp } from '../hooks/useCountUp.js';
import type { StatsBreakdown, StatsSummary, GenreBreakdown, VelocityStats, HourNovel } from '../types/index.js';

function formatDuration(seconds: number): string {
  if (seconds <= 0) return '0m';
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function hourLabel(hour: number): string {
  if (hour === 0) return '12am';
  if (hour < 12) return `${hour}am`;
  if (hour === 12) return '12pm';
  return `${hour - 12}pm`;
}

function CellLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="text-muted"
      style={{ fontSize: 'var(--text-xs)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}
    >
      {children}
    </div>
  );
}

function CellTitle({ title, sub, action }: { title: string; sub?: string; action?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 10 }}>
      <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 600 }}>{title}</h2>
      {sub && <span className="text-muted" style={{ fontSize: 'var(--text-xs)' }}>{sub}</span>}
      {action && <span style={{ marginLeft: 'auto', alignSelf: 'center' }}>{action}</span>}
    </div>
  );
}

/** Time-window toggle for a single card, not a page-wide filter — the hourly
 *  card is the only one whose question ("when do I read?") changes meaning
 *  between all-time and this week. */
function WindowChip({ active, onToggle }: { active: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={active}
      style={{
        fontSize: 'var(--text-xs)',
        fontWeight: 500,
        padding: '3px 10px',
        borderRadius: 9999,
        cursor: 'pointer',
        border: `1px solid ${active ? 'var(--color-accent)' : 'var(--color-border)'}`,
        background: active ? 'var(--color-accent-glow)' : 'transparent',
        color: active ? 'var(--color-accent)' : 'var(--color-text-muted)',
        transition: 'background 160ms ease, border-color 160ms ease, color 160ms ease',
      }}
    >
      This week
    </button>
  );
}

/** A Bento cell — the grid's spans live in index.css (.stats-cell-*); this
 *  just wires the panel surface + a cycling stagger delay onto whichever
 *  span class the caller picks. Capped at 4 stagger buckets (existing
 *  .stagger-1..4 in index.css, 50-200ms) — well under motion.md's ~500ms
 *  total-stagger ceiling even across all 11 cells. */
function Cell({
  span,
  index,
  children,
}: {
  span?: 'hero' | 'wide' | 'tall';
  index: number;
  children: React.ReactNode;
}) {
  const spanClass = span ? `stats-cell-${span}` : '';
  const staggerClass = `stagger-${(index % 4) + 1}`;
  return (
    <div
      className={`panel animate-fade-in ${staggerClass} ${spanClass}`}
      style={{
        borderRadius: 'var(--radius-xl)',
        padding: '10px 16px 12px',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: span === 'wide' ? 180 : span === 'hero' ? 150 : span === 'tall' ? 150 : 92,
        alignSelf: 'stretch',
      }}
    >
      {children}
    </div>
  );
}

function HeroStat({ label, seconds, sub }: { label: string; seconds: number; sub: string }) {
  const animated = useCountUp(seconds, 1200);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '100%', minHeight: 140 }}>
      <CellLabel>{label}</CellLabel>
      <div className="stats-hero-value" style={{ fontSize: 'var(--text-4xl)', lineHeight: 1.05, fontWeight: 700, color: 'var(--color-text)' }}>
        {formatDuration(Math.round(animated))}
      </div>
      <div className="text-faint" style={{ fontSize: 'var(--text-sm)', marginTop: 8 }}>{sub}</div>
    </div>
  );
}

function VelocityStat({ velocity }: { velocity?: VelocityStats }) {
  const animated = useCountUp(velocity?.current_avg_per_day ?? 0, 900);
  const trend = velocity?.trend_pct ?? null;
  const trendColor =
    trend === null || trend === 0
      ? 'var(--color-text-faint)'
      : trend > 0
        ? 'var(--color-success)'
        : 'var(--color-danger)';

  return (
    <div>
      <CellLabel>Velocity</CellLabel>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <span className="tabular" style={{ fontSize: 'var(--text-3xl)', fontWeight: 700, fontFamily: 'var(--font-display)', color: 'var(--color-text)' }}>
          {animated.toFixed(1)}
        </span>
        <span className="text-muted" style={{ fontSize: 'var(--text-sm)' }}>chapters/day</span>
      </div>
      <div style={{ fontSize: 'var(--text-sm)', marginTop: 4, color: trendColor }}>
        {trend === null ? 'no baseline yet' : `${trend > 0 ? '+' : ''}${trend}% vs prior week`}
      </div>
    </div>
  );
}

function MiniStat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <CellLabel>{label}</CellLabel>
      <div className="tabular" style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, fontFamily: 'var(--font-display)', color: 'var(--color-text)' }}>
        {value}
      </div>
      {sub && <div className="text-faint" style={{ fontSize: 'var(--text-xs)', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function WhenYouRead({
  busiestHour,
  busiestWeekday,
}: {
  busiestHour?: { hour: number; seconds: number };
  busiestWeekday?: { label: string; seconds: number };
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'space-between' }}>
      <div>
        <CellLabel>Busiest Hour</CellLabel>
        <div className="tabular" style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, fontFamily: 'var(--font-display)', color: 'var(--color-text)' }}>
          {busiestHour && busiestHour.seconds > 0 ? hourLabel(busiestHour.hour) : '—'}
        </div>
        <div className="text-faint" style={{ fontSize: 'var(--text-xs)', marginTop: 4 }}>
          {busiestHour && busiestHour.seconds > 0 ? formatDuration(busiestHour.seconds) : 'no data yet'}
        </div>
      </div>
      <div style={{ marginTop: 20 }}>
        <CellLabel>Busiest Day</CellLabel>
        <div className="tabular" style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, fontFamily: 'var(--font-display)', color: 'var(--color-text)' }}>
          {busiestWeekday && busiestWeekday.seconds > 0 ? busiestWeekday.label : '—'}
        </div>
        <div className="text-faint" style={{ fontSize: 'var(--text-xs)', marginTop: 4 }}>
          {busiestWeekday && busiestWeekday.seconds > 0 ? formatDuration(busiestWeekday.seconds) : 'no data yet'}
        </div>
      </div>
    </div>
  );
}

interface Bar {
  key: string | number;
  value: number;
  tooltip: string;
  tickLabel?: string;
  /** Rich hover content. When present it replaces the native `title` tooltip,
   *  which could only ever be one flat string. */
  detail?: React.ReactNode;
}

/** Flat single-hue magnitude bars — teal is this app's existing "reading
 *  activity" hue (see ActivityHeatmap). Bars keep a visible sliver at zero
 *  so the axis stays legible even for untouched hours/weekdays; ticks are
 *  selective, not one per bar, per the mark-spec guidance against labeling
 *  every point. */
function BarChart({ bars, color, height = 120 }: { bars: Bar[]; color: string; height?: number }) {
  const max = Math.max(1, ...bars.map(b => b.value));
  const [hovered, setHovered] = useState<string | number | null>(null);
  const hoveredBar = bars.find(b => b.key === hovered);

  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'stretch', gap: 3, height: '100%', minHeight: height, flex: 1, paddingBottom: 4 }}>
      {hoveredBar?.detail && (
        <div
          role="presentation"
          className="glass"
          style={{
            position: 'absolute',
            bottom: 'calc(100% + 8px)',
            // Track the hovered bar horizontally, then clamp so a card near
            // either edge stays inside the cell instead of clipping.
            left: `${Math.min(88, Math.max(12, ((bars.indexOf(hoveredBar) + 0.5) / bars.length) * 100))}%`,
            transform: 'translateX(-50%)',
            minWidth: 190,
            maxWidth: 260,
            padding: '10px 12px',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--color-border)',
            background: 'var(--color-bg-raised)',
            boxShadow: '0 10px 28px rgba(0,0,0,0.45)',
            zIndex: 20,
            pointerEvents: 'none',
          }}
        >
          {hoveredBar.detail}
        </div>
      )}
      {bars.map(b => {
        const ratio = b.value / max;
        const barHeight = b.value > 0 ? Math.max(10, ratio * 100) : 8;
        return (
          <div key={b.key} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', minWidth: 0, height: '100%' }}>
            <div
              data-value={b.value}
              data-label={b.tickLabel ?? ''}
              tabIndex={0}
              // Keep the native tooltip as the fallback when there's no rich
              // detail, and as the accessible name either way.
              title={b.detail ? undefined : b.tooltip}
              aria-label={b.tooltip}
              onMouseEnter={() => setHovered(b.key)}
              onMouseLeave={() => setHovered(h => (h === b.key ? null : h))}
              onFocus={() => setHovered(b.key)}
              onBlur={() => setHovered(h => (h === b.key ? null : h))}
              className="bar-chart-bar"
              style={{
                width: '100%',
                height: `${barHeight}%`,
                background: color,
                borderRadius: '3px 3px 0 0',
                minHeight: b.value > 0 ? 10 : 6,
                opacity: b.value > 0 ? 1 : 0.7,
                display: 'block',
                transition: 'transform 180ms ease, filter 180ms ease, box-shadow 180ms ease, opacity 180ms ease',
                cursor: 'pointer',
              }}
            />
            {b.tickLabel !== undefined && (
              <span className="text-faint" style={{ display: 'block', fontSize: 10, minHeight: 12, paddingTop: 4, whiteSpace: 'nowrap', lineHeight: 1.1, fontWeight: 500 }}>
                {b.tickLabel}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ShareBars({
  rows,
}: {
  rows: { key: string; icon?: React.ReactNode; label: string; sub: string; percent: number }[];
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {rows.map(r => (
        <div key={r.key}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, fontSize: 'var(--text-sm)' }}>
            {r.icon}
            <span style={{ fontWeight: 500 }}>{r.label}</span>
            <span style={{ flex: 1 }} />
            <span className="tabular text-muted" style={{ fontSize: 'var(--text-xs)' }}>{r.sub}</span>
          </div>
          <div style={{ height: 6, borderRadius: 9999, overflow: 'hidden', background: 'rgba(255,255,255,0.08)' }}>
            <div style={{ width: `${r.percent}%`, height: '100%', background: 'var(--color-accent)', borderRadius: 9999 }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** The hover card for one hour of the day. The roadmap item behind this asked
 *  for reading *context* rather than a metadata string: novel names when the
 *  hour is shared, a chapter range when one novel dominates it. */
export function HourDetail({
  hour,
  seconds,
  sessions,
  novels,
}: {
  hour: number;
  seconds: number;
  sessions: number;
  novels: HourNovel[];
}) {
  const lead = novels[0];
  // "Dominates" = the top novel holds most of the hour. Below that the hour
  // reads as shared and the novel list is the more useful answer.
  const dominant =
    novels.length === 1 || (lead && seconds > 0 && lead.seconds / seconds >= 0.7);
  const range =
    lead && lead.min_chapter !== null && lead.max_chapter !== null
      ? lead.min_chapter === lead.max_chapter
        ? `Ch. ${lead.min_chapter}`
        : `Ch. ${lead.min_chapter}–${lead.max_chapter}`
      : null;

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: novels.length ? 8 : 0 }}>
        <span style={{ fontWeight: 600, fontSize: 'var(--text-sm)' }}>{hourLabel(hour)}</span>
        <span className="tabular" style={{ fontWeight: 600, fontSize: 'var(--text-sm)', color: 'var(--color-teal)' }}>
          {formatDuration(seconds)}
        </span>
        <span className="text-faint" style={{ marginLeft: 'auto', fontSize: 10 }}>
          {sessions} session{sessions === 1 ? '' : 's'}
        </span>
      </div>

      {novels.length === 0 ? (
        seconds > 0 ? null : (
          <span className="text-faint" style={{ fontSize: 'var(--text-xs)' }}>No reading in this hour.</span>
        )
      ) : dominant && lead ? (
        <div style={{ fontSize: 'var(--text-xs)' }}>
          <div style={{ color: 'var(--color-text)', marginBottom: 2 }}>{lead.title}</div>
          {range && <div className="text-muted tabular">{range}</div>}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 'var(--text-xs)' }}>
          {novels.map(n => (
            <div key={n.novel_id} style={{ display: 'flex', gap: 8 }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.title}</span>
              <span className="text-muted tabular" style={{ marginLeft: 'auto', flexShrink: 0 }}>
                {formatDuration(n.seconds)}
              </span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

export function Stats() {
  const { data: summary, isLoading: summaryLoading } = useSWR<StatsSummary>('/stats/summary', swrFetcher);
  const [hourWindow, setHourWindow] = useState<'all' | 'week'>('week');
  const { data: breakdown, isLoading: breakdownLoading } = useSWR<StatsBreakdown>(
    hourWindow === 'week' ? '/stats/breakdown?window=week' : '/stats/breakdown',
    swrFetcher,
    // Toggling the chip changes the SWR key. Without this the whole page drops
    // to its loading spinner on every toggle, because isLoading is true for a
    // key that has never been fetched.
    { keepPreviousData: true },
  );
  const { data: genres, isLoading: genresLoading } = useSWR<GenreBreakdown>('/stats/genres', swrFetcher);
  const { data: velocity, isLoading: velocityLoading } = useSWR<VelocityStats>('/stats/velocity', swrFetcher);

  const loading = summaryLoading || breakdownLoading || genresLoading || velocityLoading;

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}><Spinner size={32} /></div>;
  }

  const busiestHour = breakdown?.by_hour.reduce((max, b) => (b.seconds > max.seconds ? b : max), breakdown.by_hour[0]);
  const busiestWeekday = breakdown?.by_weekday.reduce((max, b) => (b.seconds > max.seconds ? b : max), breakdown.by_weekday[0]);
  const totalDeviceSeconds = breakdown?.by_device.reduce((sum, d) => sum + d.seconds, 0) ?? 0;
  const totalTracked = summary ? Object.values(summary.novels_by_status).reduce((a, b) => a + b, 0) : 0;

  return (
    <div className="animate-fade-in">
      <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, marginBottom: 24 }}>Stats</h1>

      <div className="stats-bento">
        <Cell span="hero" index={0}>
          <HeroStat
            label="Reading Time"
            seconds={summary?.reading_sessions.total_time_seconds ?? 0}
            sub={`${summary?.reading_sessions.total ?? 0} sessions`}
          />
        </Cell>

        <Cell span="wide" index={1}>
          <VelocityStat velocity={velocity} />
        </Cell>

        <Cell span="tall" index={2}>
          <WhenYouRead busiestHour={busiestHour} busiestWeekday={busiestWeekday} />
        </Cell>

        <Cell index={3}>
          <MiniStat label="Avg Session" value={formatDuration(summary?.reading_sessions.avg_session_seconds ?? 0)} />
        </Cell>

        <Cell index={0}>
          <MiniStat
            label="Avg Progress"
            value={`${Math.round(summary?.avg_progress ?? 0)}%`}
            sub={`across ${summary?.total_novels ?? 0} novels`}
          />
        </Cell>

        <Cell index={1}>
          <MiniStat
            label="Completion Rate"
            value={`${Math.round(summary?.completion_rate ?? 0)}%`}
            sub={`${summary?.novels_by_status.completed ?? 0} of ${totalTracked} tracked`}
          />
        </Cell>

        <Cell index={2}>
          <MiniStat label="Active Devices" value={String(summary?.active_devices ?? 0)} />
        </Cell>

        <Cell span="wide" index={3}>
          <CellTitle
            title="Reading Time by Hour"
            sub="local session start time"
            action={
              <WindowChip
                active={hourWindow === 'week'}
                onToggle={() => setHourWindow(w => (w === 'week' ? 'all' : 'week'))}
              />
            }
          />
          <BarChart
            color="var(--color-teal)"
            bars={(breakdown?.by_hour ?? []).map(b => ({
              key: b.hour,
              value: b.seconds,
              tooltip: `${hourLabel(b.hour)} — ${formatDuration(b.seconds)}, ${b.sessions} session${b.sessions === 1 ? '' : 's'}`,
              tickLabel: hourLabel(b.hour),
              detail: (
                <HourDetail hour={b.hour} seconds={b.seconds} sessions={b.sessions} novels={b.novels} />
              ),
            }))}
          />
        </Cell>

        <Cell span="wide" index={0}>
          <CellTitle title="Reading Time by Weekday" />
          <BarChart
            color="var(--color-teal)"
            bars={(breakdown?.by_weekday ?? []).map(b => ({
              key: b.weekday,
              value: b.seconds,
              tooltip: `${b.label} — ${formatDuration(b.seconds)}, ${b.sessions} session${b.sessions === 1 ? '' : 's'}`,
              tickLabel: b.label.slice(0, 3),
            }))}
          />
        </Cell>

        <Cell span="wide" index={1}>
          <CellTitle title="By Genre" />
          {!genres || genres.length === 0 ? (
            <p className="text-faint" style={{ fontSize: 'var(--text-sm)' }}>No genre data yet.</p>
          ) : (
            <ShareBars
              rows={genres.map(g => ({
                key: g.genre,
                label: g.genre,
                sub: `${g.count} novel${g.count === 1 ? '' : 's'} · ${g.percent}%`,
                percent: g.percent,
              }))}
            />
          )}
        </Cell>

        <Cell span="wide" index={2}>
          <CellTitle title="By Device" />
          {!breakdown || breakdown.by_device.length === 0 ? (
            <p className="text-faint" style={{ fontSize: 'var(--text-sm)' }}>No device data yet.</p>
          ) : (
            <ShareBars
              rows={breakdown.by_device.map(d => {
                const isMobile = /mobile|phone|android|ios/i.test(d.device_label);
                const DeviceIcon = isMobile ? SmartphoneIcon : MonitorIcon;
                return {
                  key: d.device_id,
                  icon: <DeviceIcon size={14} />,
                  label: d.device_label,
                  sub: `${formatDuration(d.seconds)} · ${d.sessions} session${d.sessions === 1 ? '' : 's'}`,
                  percent: totalDeviceSeconds > 0 ? (d.seconds / totalDeviceSeconds) * 100 : 0,
                };
              })}
            />
          )}
        </Cell>
      </div>
    </div>
  );
}
