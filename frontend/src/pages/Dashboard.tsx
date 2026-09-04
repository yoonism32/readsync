import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import useSWR from 'swr';
import { swrFetcher, fetchNovels, formatTimestamp, resumeUrl } from '../api/client.js';
import { BehindBadge } from '../components/BehindBadge.js';
import { ActivityHeatmap } from '../components/ActivityHeatmap.js';
import { OnThisDay } from '../components/OnThisDay.js';
import { ProgressBar } from '../components/ProgressBar.js';
import { StatusBadge } from '../components/StatusBadge.js';
import { Spinner } from '../components/Spinner.js';
import { ArrowRightIcon } from '../components/Icon.js';
import { useNow } from '../hooks/useNow.js';
import { behindCount } from '../lib/behindStatus.js';
import type { Novel, StatsSummary } from '../types/index.js';

/** Tier 1: a figure you act on. Reads loud when it has a value, quiet at zero. */
function AttentionStat({ label, value, sub }: { label: string; value: number; sub?: string }) {
  const active = value > 0;
  return (
    <div
      className="panel"
      style={{
        borderRadius: 'var(--radius-xl)',
        padding: '18px 22px',
        borderColor: active ? 'var(--color-accent-border)' : 'var(--color-border)',
        background: active ? 'var(--color-accent-glow)' : 'var(--color-bg-card)',
      }}
    >
      <div
        className="text-muted"
        style={{ fontSize: 'var(--text-xs)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}
      >
        {label}
      </div>
      <div
        className="tabular"
        style={{
          fontSize: 'var(--text-3xl)',
          lineHeight: 1.1,
          fontWeight: 700,
          fontFamily: 'var(--font-display)',
          color: active ? 'var(--color-accent-bright)' : 'var(--color-text-faint)',
        }}
      >
        {value}
      </div>
      {sub && <div className="text-faint" style={{ fontSize: 'var(--text-xs)', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

/** Tier 2: a reference figure. Present, not competing for attention. */
function MinorStat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div>
      <dt className="text-muted" style={{ fontSize: 'var(--text-xs)', marginBottom: 2 }}>{label}</dt>
      {/* `sub` lives inside the <dd>: a <div> wrapper inside a <dl> may only
          hold a dt/dd group, so a third sibling made the list invalid. */}
      <dd
        className="tabular"
        style={{ margin: 0, fontSize: 'var(--text-lg)', fontWeight: 600, lineHeight: 1.2 }}
      >
        {value}
        {sub && <div className="text-faint" style={{ fontSize: 'var(--text-xs)', fontWeight: 400, marginTop: 1 }}>{sub}</div>}
      </dd>
    </div>
  );
}

export function Dashboard() {
  useNow(); // ticks so "Xm ago" labels below advance without a data refetch
  const { data: stats, isLoading: statsLoading } = useSWR<StatsSummary>('/stats/summary', swrFetcher);
  // Live updates come from the socket in Layout.tsx (chapters:updated /
  // progress:updated → mutate('/novels')); this 30-minute interval is only a
  // safety net if a tab's socket dies silently. See docs/ARCHITECTURE.md.
  const { data: novelsData } = useSWR<Novel[]>('/novels', fetchNovels, {
    refreshInterval: 30 * 60_000,
  });

  const recentNovels = (novelsData ?? [])
    .filter(n => n.status === 'reading' && n.latest_read_at)
    .sort((a, b) => new Date(b.latest_read_at!).getTime() - new Date(a.latest_read_at!).getTime())
    .slice(0, 8);

  const totalHours = stats ? Math.round(stats.reading_sessions.total_time_seconds / 3600) : 0;

  const continueNovel = recentNovels.find(n => n.latest_url);

  // Library-wide signals the legacy dashboards computed client-side from
  // the same /novels payload — never ported to the stat grid.
  const libraryStats = useMemo(() => {
    const novels = novelsData ?? [];
    const devices = new Set<string>();
    let novelsBehind = 0;
    let newChapters = 0;
    let syncConflicts = 0;

    for (const n of novels) {
      const behind = behindCount(n);
      if (behind > 0) {
        novelsBehind++;
        newChapters += behind;
      }
      for (const d of n.devices_reading) devices.add(d.device_id);
      if (n.devices_reading.length > 1) {
        const distinctChapters = new Set(n.devices_reading.map(d => d.chapter_num));
        if (distinctChapters.size > 1) syncConflicts++;
      }
    }

    return { totalDevices: devices.size, novelsBehind, newChapters, syncConflicts };
  }, [novelsData]);

  return (
    <div className="animate-fade-in">
      <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, marginBottom: 24 }}>Dashboard</h1>

      {/* Continue Reading — resume the most recently read novel */}
      {continueNovel?.latest_url && (
        <a
          href={resumeUrl(continueNovel.latest_url, continueNovel.latest_percent)}
          target="_blank"
          rel="noopener noreferrer"
          className="panel row-interactive-strong"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            padding: '16px 20px',
            marginBottom: 24,
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--color-accent-border)',
            background: 'var(--color-accent-glow)',
            textDecoration: 'none',
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              className="text-muted"
              style={{ fontSize: 'var(--text-xs)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}
            >
              Continue Reading
            </div>
            <div style={{ fontWeight: 700, fontSize: 'var(--text-lg)', color: 'var(--color-text)' }}>
              {continueNovel.title}
            </div>
            <div className="text-muted" style={{ fontSize: 'var(--text-sm)', marginTop: 2 }}>
              Ch. {continueNovel.latest_chapter ?? '?'} · {Math.round(continueNovel.latest_percent ?? 0)}%
              {continueNovel.latest_read_at && ` · ${formatTimestamp(continueNovel.latest_read_at)}`}
              {continueNovel.latest_device_label && ` on ${continueNovel.latest_device_label}`}
            </div>
          </div>
          <ArrowRightIcon size={22} style={{ color: 'var(--color-accent)', flexShrink: 0 }} />
        </a>
      )}

      {/* Stats grid */}
      {statsLoading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spinner /></div>
      ) : (
        <div className="stagger-1 animate-fade-in" style={{ marginBottom: 32 }}>
          {/* Tier 1 — the three you act on. Each goes quiet at zero, so a
              caught-up library reads calm instead of shouting three noughts. */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))',
              gap: 12,
              marginBottom: 14,
            }}
          >
            <AttentionStat label="Novels behind" value={libraryStats.novelsBehind} />
            <AttentionStat label="New chapters" value={libraryStats.newChapters} />
            <AttentionStat
              label="Sync conflicts"
              value={libraryStats.syncConflicts}
              sub={libraryStats.syncConflicts > 0 ? 'Devices disagree on chapter' : undefined}
            />
          </div>

          {/* Tier 2 — reference figures. Dense, quiet, scannable. */}
          <dl
            className="panel"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))',
              gap: '10px 20px',
              margin: 0,
              padding: '14px 18px',
              borderRadius: 'var(--radius-lg)',
            }}
          >
            <MinorStat label="Novels" value={stats?.total_novels ?? 0} />
            <MinorStat label="Reading" value={stats?.novels_by_status?.reading ?? 0} />
            <MinorStat label="Completed" value={stats?.novels_by_status?.completed ?? 0} />
            <MinorStat label="Plan to read" value={stats?.novels_by_status?.['plan-to-read'] ?? 0} />
            <MinorStat label="Avg progress" value={`${Math.round(stats?.avg_progress ?? 0)}%`} />
            <MinorStat label="Bookmarks" value={stats?.total_bookmarks ?? 0} />
            <MinorStat label="Devices" value={stats?.active_devices ?? libraryStats.totalDevices} />
            <MinorStat
              label="Reading time"
              value={`${totalHours}h`}
              sub={`${stats?.reading_sessions.total ?? 0} sessions`}
            />
          </dl>
        </div>
      )}

      <ActivityHeatmap />

      {/* Currently reading — the section you act on every day, so it carries
          extra weight through type size and spacing rather than a zoom
          multiplier (which compounded with the old html-level zoom). */}
      <div style={{ marginTop: 36 }}>
        <h2 style={{ fontSize: 'var(--text-xl)', fontWeight: 600, marginBottom: 14 }}>Currently Reading</h2>
        {recentNovels.length === 0 ? (
          <p className="text-muted" style={{ fontSize: 'var(--text-sm)' }}>Nothing in progress.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {recentNovels.map((n, i) => (
              <Link
                key={n.novel_id}
                to={`/novel/${encodeURIComponent(n.novel_id)}`}
                className="animate-fade-in panel row-interactive"
                style={{
                  animationDelay: `${i * 40}ms`,
                  borderRadius: 'var(--radius-lg)',
                  padding: '14px 18px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  textDecoration: 'none',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <span style={{ fontWeight: 600, fontSize: 'var(--text-base)' }}>{n.title}</span>
                    <BehindBadge novel={n} />
                  </div>
                  <ProgressBar percent={n.latest_percent ?? 0} showLabel size="sm" />
                </div>
                <div style={{ flexShrink: 0, textAlign: 'right' }}>
                  <StatusBadge status={n.status} />
                  {n.latest_read_at && (
                    <div className="text-faint" style={{ fontSize: 'var(--text-xs)', marginTop: 4 }}>
                      {formatTimestamp(n.latest_read_at)}
                    </div>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      <OnThisDay />
    </div>
  );
}
