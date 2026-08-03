import { Link } from 'react-router-dom';
import useSWR from 'swr';
import { swrFetcher, fetchNovels, formatTimestamp, resumeUrl } from '../api/client.js';
import { BehindBadge } from '../components/BehindBadge.js';
import { ActivityHeatmap } from '../components/ActivityHeatmap.js';
import { ProgressBar } from '../components/ProgressBar.js';
import { StatusBadge } from '../components/StatusBadge.js';
import { Spinner } from '../components/Spinner.js';
import type { Novel, StatsSummary } from '../types/index.js';

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div
      className="glass"
      style={{ borderRadius: 'var(--radius-xl)', padding: '20px 24px' }}
    >
      <div className="text-muted" style={{ fontSize: 'var(--text-xs)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
        {label}
      </div>
      <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, fontFamily: 'var(--font-display)', fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </div>
      {sub && <div className="text-faint" style={{ fontSize: 'var(--text-xs)', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

export function Dashboard() {
  const { data: stats, isLoading: statsLoading } = useSWR<StatsSummary>('/stats/summary', swrFetcher);
  const { data: novelsData } = useSWR<Novel[]>('/novels', fetchNovels, { revalidateOnFocus: false });

  const recentNovels = (novelsData ?? [])
    .filter(n => n.status === 'reading' && n.latest_read_at)
    .sort((a, b) => new Date(b.latest_read_at!).getTime() - new Date(a.latest_read_at!).getTime())
    .slice(0, 8);

  const totalHours = stats ? Math.round(stats.reading_sessions.total_time_seconds / 3600) : 0;

  const continueNovel = recentNovels.find(n => n.latest_url);

  return (
    <div className="animate-fade-in">
      <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, marginBottom: 24 }}>Dashboard</h1>

      {/* Continue Reading — resume the most recently read novel */}
      {continueNovel?.latest_url && (
        <a
          href={resumeUrl(continueNovel.latest_url, continueNovel.latest_percent)}
          target="_blank"
          rel="noopener noreferrer"
          className="glass"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            padding: '16px 20px',
            marginBottom: 24,
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--color-gold-border)',
            background: 'var(--color-gold-glow)',
            textDecoration: 'none',
            transition: 'border-color 0.15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--color-gold)')}
          onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--color-gold-border)')}
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
          <span aria-hidden="true" style={{ fontSize: 24, color: 'var(--color-gold)' }}>→</span>
        </a>
      )}

      {/* Stats grid */}
      {statsLoading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spinner /></div>
      ) : (
        <div
          className="stagger-1 animate-fade-in"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: 12,
            marginBottom: 32,
          }}
        >
          <StatCard label="Novels" value={stats?.total_novels ?? 0} />
          <StatCard label="Reading" value={stats?.novels_by_status?.reading ?? 0} />
          <StatCard label="Completed" value={stats?.novels_by_status?.completed ?? 0} />
          <StatCard label="Plan to Read" value={stats?.novels_by_status?.['plan-to-read'] ?? 0} />
          <StatCard label="Reading Time" value={`${totalHours}h`} sub={`${stats?.reading_sessions.total ?? 0} sessions`} />
          <StatCard label="Avg Progress" value={`${Math.round(stats?.avg_progress ?? 0)}%`} />
          <StatCard label="Bookmarks" value={stats?.total_bookmarks ?? 0} />
        </div>
      )}

      <ActivityHeatmap />

      {/* Currently reading — scaled up further: this is the section you
          actually act on every day, so it gets extra visual weight. */}
      <div style={{ zoom: 1.25 }}>
        <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 600, marginBottom: 12 }}>Currently Reading</h2>
        {recentNovels.length === 0 ? (
          <p className="text-muted" style={{ fontSize: 'var(--text-sm)' }}>Nothing in progress.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {recentNovels.map((n, i) => (
              <Link
                key={n.novel_id}
                to={`/novel/${encodeURIComponent(n.novel_id)}`}
                className="animate-fade-in glass"
                style={{
                  animationDelay: `${i * 40}ms`,
                  borderRadius: 'var(--radius-lg)',
                  padding: '12px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  transition: 'border-color 0.15s',
                  textDecoration: 'none',
                }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--color-accent-border)')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--color-border)')}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <span style={{ fontWeight: 600, fontSize: 'var(--text-sm)' }}>{n.title}</span>
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
    </div>
  );
}
