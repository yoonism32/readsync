import useSWR from 'swr';
import { swrFetcher } from '../api/client.js';
import { Spinner } from '../components/Spinner.js';
import { SmartphoneIcon, MonitorIcon } from '../components/Icon.js';
import type { StatsBreakdown, StatsSummary } from '../types/index.js';

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

function StatTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="panel" style={{ borderRadius: 'var(--radius-xl)', padding: '18px 22px' }}>
      <div
        className="text-muted"
        style={{ fontSize: 'var(--text-xs)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}
      >
        {label}
      </div>
      <div
        className="tabular"
        style={{ fontSize: 'var(--text-2xl)', lineHeight: 1.1, fontWeight: 700, fontFamily: 'var(--font-display)', color: 'var(--color-text)' }}
      >
        {value}
      </div>
      {sub && <div className="text-faint" style={{ fontSize: 'var(--text-xs)', marginTop: 4 }}>{sub}</div>}
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

function ChartPanel({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="panel" style={{ borderRadius: 'var(--radius-xl)', padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 16 }}>
        <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 600 }}>{title}</h2>
        {sub && <span className="text-muted" style={{ fontSize: 'var(--text-xs)' }}>{sub}</span>}
      </div>
      {children}
    </div>
  );
}

export function Stats() {
  const { data: summary, isLoading: summaryLoading } = useSWR<StatsSummary>('/stats/summary', swrFetcher);
  const { data: breakdown, isLoading: breakdownLoading } = useSWR<StatsBreakdown>('/stats/breakdown', swrFetcher);

  const loading = summaryLoading || breakdownLoading;

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}><Spinner size={32} /></div>;
  }

  const busiestHour = breakdown?.by_hour.reduce((max, b) => (b.seconds > max.seconds ? b : max), breakdown.by_hour[0]);
  const busiestWeekday = breakdown?.by_weekday.reduce((max, b) => (b.seconds > max.seconds ? b : max), breakdown.by_weekday[0]);
  const totalDeviceSeconds = breakdown?.by_device.reduce((sum, d) => sum + d.seconds, 0) ?? 0;

  return (
    <div className="animate-fade-in">
      <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, marginBottom: 24 }}>Stats</h1>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 24 }}>
        <StatTile label="Reading Time" value={formatDuration(summary?.reading_sessions.total_time_seconds ?? 0)} sub={`${summary?.reading_sessions.total ?? 0} sessions`} />
        <StatTile label="Avg Session" value={formatDuration(summary?.reading_sessions.avg_session_seconds ?? 0)} />
        <StatTile label="Avg Progress" value={`${Math.round(summary?.avg_progress ?? 0)}%`} sub={`across ${summary?.total_novels ?? 0} novels`} />
        <StatTile
          label="Busiest Hour"
          value={busiestHour && busiestHour.seconds > 0 ? hourLabel(busiestHour.hour) : '—'}
          sub={busiestHour && busiestHour.seconds > 0 ? formatDuration(busiestHour.seconds) : 'no data yet'}
        />
        <StatTile
          label="Busiest Day"
          value={busiestWeekday && busiestWeekday.seconds > 0 ? busiestWeekday.label : '—'}
          sub={busiestWeekday && busiestWeekday.seconds > 0 ? formatDuration(busiestWeekday.seconds) : 'no data yet'}
        />
      </div>

      <div style={{ display: 'grid', gap: 16, marginBottom: 16 }}>
        <ChartPanel title="Reading Time by Hour" sub="local session start time">
          <BarChart
            color="var(--color-teal)"
            bars={(breakdown?.by_hour ?? []).map(b => ({
              key: b.hour,
              value: b.seconds,
              tooltip: `${hourLabel(b.hour)} — ${formatDuration(b.seconds)}, ${b.sessions} session${b.sessions === 1 ? '' : 's'}`,
              tickLabel: b.hour % 3 === 0 ? hourLabel(b.hour) : undefined,
            }))}
          />
        </ChartPanel>

        <ChartPanel title="Reading Time by Weekday">
          <BarChart
            color="var(--color-teal)"
            bars={(breakdown?.by_weekday ?? []).map(b => ({
              key: b.weekday,
              value: b.seconds,
              tooltip: `${b.label} — ${formatDuration(b.seconds)}, ${b.sessions} session${b.sessions === 1 ? '' : 's'}`,
              tickLabel: b.label.slice(0, 3),
            }))}
          />
        </ChartPanel>

        <ChartPanel title="By Device">
          {!breakdown || breakdown.by_device.length === 0 ? (
            <p className="text-faint" style={{ fontSize: 'var(--text-sm)' }}>No device data yet.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {breakdown.by_device.map(d => {
                const share = totalDeviceSeconds > 0 ? (d.seconds / totalDeviceSeconds) * 100 : 0;
                const isMobile = /mobile|phone|android|ios/i.test(d.device_label);
                const DeviceIcon = isMobile ? SmartphoneIcon : MonitorIcon;
                return (
                  <div key={d.device_id}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, fontSize: 'var(--text-sm)' }}>
                      <DeviceIcon size={14} />
                      <span style={{ fontWeight: 500 }}>{d.device_label}</span>
                      <span style={{ flex: 1 }} />
                      <span className="tabular text-muted" style={{ fontSize: 'var(--text-xs)' }}>
                        {formatDuration(d.seconds)} · {d.sessions} session{d.sessions === 1 ? '' : 's'}
                      </span>
                    </div>
                    <div style={{ height: 6, borderRadius: 9999, overflow: 'hidden', background: 'rgba(255,255,255,0.08)' }}>
                      <div style={{ width: `${share}%`, height: '100%', background: 'var(--color-accent)', borderRadius: 9999 }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ChartPanel>
      </div>
    </div>
  );
}
