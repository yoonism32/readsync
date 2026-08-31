import useSWR from 'swr';
import { swrFetcher } from '../api/client.js';
import { Spinner } from '../components/Spinner.js';
import { SmartphoneIcon, MonitorIcon } from '../components/Icon.js';
import { useCountUp } from '../hooks/useCountUp.js';
import type { StatsBreakdown, StatsSummary, GenreBreakdown, VelocityStats } from '../types/index.js';

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
      style={{ fontSize: 'var(--text-xs)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}
    >
      {children}
    </div>
  );
}

function CellTitle({ title, sub }: { title: string; sub?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 16 }}>
      <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 600 }}>{title}</h2>
      {sub && <span className="text-muted" style={{ fontSize: 'var(--text-xs)' }}>{sub}</span>}
    </div>
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
      style={{ borderRadius: 'var(--radius-xl)', padding: 20 }}
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
}

/** Flat single-hue magnitude bars — teal is this app's existing "reading
 *  activity" hue (see ActivityHeatmap). Bars keep a visible sliver at zero
 *  so the axis stays legible even for untouched hours/weekdays; ticks are
 *  selective, not one per bar, per the mark-spec guidance against labeling
 *  every point. */
function BarChart({ bars, color, height = 120 }: { bars: Bar[]; color: string; height?: number }) {
  const max = Math.max(1, ...bars.map(b => b.value));
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height }}>
      {bars.map(b => (
        <div key={b.key} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end' }}>
          <div
            title={b.tooltip}
            style={{
              width: '100%',
              height: `${Math.max(2, (b.value / max) * 100)}%`,
              background: color,
              borderRadius: '3px 3px 0 0',
            }}
          />
          {b.tickLabel !== undefined && (
            <span className="text-faint" style={{ fontSize: 10, marginTop: 4, whiteSpace: 'nowrap' }}>
              {b.tickLabel}
            </span>
          )}
        </div>
      ))}
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

export function Stats() {
  const { data: summary, isLoading: summaryLoading } = useSWR<StatsSummary>('/stats/summary', swrFetcher);
  const { data: breakdown, isLoading: breakdownLoading } = useSWR<StatsBreakdown>('/stats/breakdown', swrFetcher);
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
          <CellTitle title="Reading Time by Hour" sub="local session start time" />
          <BarChart
            color="var(--color-teal)"
            bars={(breakdown?.by_hour ?? []).map(b => ({
              key: b.hour,
              value: b.seconds,
              tooltip: `${hourLabel(b.hour)} — ${formatDuration(b.seconds)}, ${b.sessions} session${b.sessions === 1 ? '' : 's'}`,
              tickLabel: b.hour % 3 === 0 ? hourLabel(b.hour) : undefined,
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
