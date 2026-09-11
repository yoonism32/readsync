import { ResumeReading } from '../components/ResumeReading.js';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import useSWR from 'swr';
import { swrFetcher, fetchNovels, formatTimestamp } from '../api/client.js';
import { BehindBadge } from '../components/BehindBadge.js';
import { ActivityHeatmap } from '../components/ActivityHeatmap.js';
import { OnThisDay } from '../components/OnThisDay.js';
import { ProgressBar } from '../components/ProgressBar.js';
import { StatusBadge } from '../components/StatusBadge.js';
import { Spinner } from '../components/Spinner.js';
import { LoadError, PageLoading } from '../components/PageFeedback.js';
import { FlameIcon } from '../components/Icon.js';
import { useNow } from '../hooks/useNow.js';
import { behindCount } from '../lib/behindStatus.js';
import { computeStreaks } from '../lib/streaks.js';
import type { DailyActivity } from '../lib/streaks.js';
import type { Novel, StatsSummary } from '../types/index.js';

/**
 * Tier 1: a figure you act on. Reads loud when it has a value, quiet at zero.
 * `tone` picks the active-state accent — 'debt' (default) for catch-up
 * metrics, 'positive' for good-news ones — so a streak doesn't compete for
 * attention using the same alarm color as "novels behind". Fixes the
 * Impeccable audit's "both leading numbers are bad news" finding by giving
 * the row a positive card to lead with.
 */
function AttentionStat({
  label,
  value,
  sub,
  tone = 'debt',
}: {
  label: string;
  value: number | null;
  sub?: string;
  tone?: 'debt' | 'positive';
}) {
  const active = value !== null && value > 0;
  const border = tone === 'positive' ? 'var(--color-teal-border)' : 'var(--color-accent-border)';
  const glow = tone === 'positive' ? 'var(--color-teal-glow)' : 'var(--color-accent-glow)';
  const bright = tone === 'positive' ? 'var(--color-teal-bright)' : 'var(--color-accent-bright)';
  return (
    <div
      className="panel"
      style={{
        borderRadius: 'var(--radius-xl)',
        padding: '18px 22px',
        borderColor: active ? border : 'var(--color-border)',
        background: active ? glow : 'var(--color-bg-card)',
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
          color: active ? bright : 'var(--color-text-faint)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        {tone === 'positive' && active && <FlameIcon size={22} />}
        {value ?? '—'}
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
  const { data: stats, isLoading: statsLoading, error: statsError, mutate: retryStats } = useSWR<StatsSummary>('/stats/summary', swrFetcher);
  // Live updates come from the socket in Layout.tsx (chapters:updated /
  // progress:updated → mutate('/novels')); this 30-minute interval is only a
  // safety net if a tab's socket dies silently. See docs/ARCHITECTURE.md.
  const { data: novelsData, error: novelsError, mutate: retryNovels } = useSWR<Novel[]>('/novels', fetchNovels, {
    refreshInterval: 30 * 60_000,
  });
  // Same SWR key ActivityHeatmap uses below — deduped, not a second request.
  const { data: dailyData, error: dailyError, mutate: retryDaily } = useSWR<DailyActivity[]>('/stats/daily?days=365', swrFetcher, {
    revalidateOnFocus: false,
  });
  const streak = useMemo(() => computeStreaks(dailyData ?? []), [dailyData]);

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

  if (!novelsData && !novelsError) return <PageLoading title="Dashboard" />;
  if (!novelsData && novelsError) return <div className="page-view"><h1 className="page-title">Dashboard</h1><LoadError subject="your library" onRetry={() => retryNovels()} /></div>;

  return (
    <div className="page-view animate-fade-in">
      <h1 className="page-title">Dashboard</h1>
      {novelsError && <LoadError subject="the latest library changes" onRetry={() => retryNovels()} />}
      {dailyError && <LoadError subject="reading activity" onRetry={() => retryDaily()} />}

      {continueNovel?.latest_url && <ResumeReading key={continueNovel.novel_id} novel={continueNovel} />}

      <ActivityHeatmap />

      {/* Currently reading — the section you act on every day, so it carries
          extra weight through type size and spacing rather than a zoom
          multiplier (which compounded with the old html-level zoom). */}
      <div className="reading-section">
        <h2 style={{ fontSize: 'var(--text-xl)', fontWeight: 600, marginBottom: 14 }}>Currently reading</h2>
        {recentNovels.length === 0 ? (
          <p className="text-muted" style={{ fontSize: 'var(--text-sm)' }}>No novels in progress. Open My List to choose what to read next.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {recentNovels.map(n => (
              <Link
                key={n.novel_id}
                to={`/novel/${encodeURIComponent(n.novel_id)}`}
                className="panel row-interactive reading-row"
                style={{
                  borderRadius: 'var(--radius-lg)',
                  padding: '14px 18px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  textDecoration: 'none',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="reading-row-title" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
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

      {/* Stats grid. Tier 1 only needs /novels (already loaded), so it no
          longer waits on the slower /stats/summary call — only Tier 2 does.
          Each placeholder is sized to its own content (not the whole
          section) to avoid the layout shift a single combined spinner
          caused (CLS 0.874) when the two tiers settled at different times. */}
      <div className="dashboard-summary" style={{ marginBottom: 32 }}>
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
          <AttentionStat
            label="Day streak"
            value={dailyData ? streak.current : null}
            sub={streak.longest > streak.current ? `best ${streak.longest}` : undefined}
            tone="positive"
          />
          <AttentionStat label="Novels behind" value={libraryStats.novelsBehind} />
          <AttentionStat label="New chapters" value={libraryStats.newChapters} />
          <AttentionStat
            label="Sync conflicts"
            value={libraryStats.syncConflicts}
            sub={libraryStats.syncConflicts > 0 ? 'Devices disagree on chapter' : undefined}
          />
        </div>

        {/* Tier 2 — reference figures. Dense, quiet, scannable. */}
        {statsLoading ? (
          <div className="panel" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '14px 18px', minHeight: 76, borderRadius: 'var(--radius-lg)' }}><Spinner /></div>
        ) : statsError ? (
          <LoadError subject="your statistics" onRetry={() => retryStats()} />
        ) : (
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
        )}
      </div>

      <OnThisDay />
    </div>
  );
}
