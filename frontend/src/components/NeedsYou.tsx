import type { Novel } from '../types/index.js';
import { useRefreshAll } from '../hooks/useRefreshAll.js';
import { lastRefreshLabel } from '../lib/refreshStatus.js';
import { FlameIcon, RefreshIcon } from './Icon.js';

interface Props {
  novels: Novel[];
  novelsBehind: number;
  newChapters: number;
  syncConflicts: number;
  devices: number;
  streak: { current: number; longest: number } | null; // null while /stats/daily loads
}

export function NeedsYou({ novels, novelsBehind, newChapters, syncConflicts, devices, streak }: Props) {
  const refresh = useRefreshAll();
  const behindActive = novelsBehind > 0;

  return (
    <section className="panel needs-you" aria-labelledby="needs-you-title">
      <h2 id="needs-you-title" className="needs-you-label">Needs you</h2>

      <div className="needs-you-figure">
        <span
          className="tabular"
          style={{ color: behindActive ? 'var(--color-accent-bright)' : 'var(--color-text-faint)' }}
        >
          {novelsBehind}
        </span>
        <span>novels behind</span>
      </div>
      <p className="text-muted tabular" style={{ fontSize: 'var(--text-sm)', marginTop: 2 }}>
        {newChapters.toLocaleString()} new chapters · checked {lastRefreshLabel(refresh.lastRefresh)}
      </p>

      <button
        type="button"
        className="needs-you-refresh"
        disabled={refresh.isRefreshing}
        onClick={() => { void refresh.refreshAll(novels); }}
      >
        <RefreshIcon size={14} />
        {refresh.isRefreshing && refresh.progress
          ? `Refreshing ${refresh.progress.done}/${refresh.progress.total}`
          : 'Refresh all'}
      </button>
      {refresh.summary && (
        <p className="text-faint" style={{ fontSize: 'var(--text-xs)', marginTop: 6 }}>{refresh.summary}</p>
      )}

      <div className="needs-you-rule" />

      <div className="needs-you-row">
        <span
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 'var(--text-lg)',
            color: streak && streak.current > 0 ? 'var(--color-teal-bright)' : 'var(--color-text-faint)',
          }}
        >
          <FlameIcon size={16} />
          {streak ? `${streak.current}-day streak` : '—'}
        </span>
        {streak && streak.longest > streak.current && (
          <span className="text-faint" style={{ fontSize: 'var(--text-xs)' }}>best {streak.longest}</span>
        )}
      </div>
      <div className="needs-you-row text-faint" style={{ fontSize: 'var(--text-sm)', marginTop: 12 }}>
        <span style={{ color: syncConflicts > 0 ? 'var(--color-accent-bright)' : undefined }}>
          {syncConflicts > 0 ? `${syncConflicts} sync conflict${syncConflicts === 1 ? '' : 's'}` : 'No sync conflicts'}
        </span>
        <span>{devices} device{devices === 1 ? '' : 's'}</span>
      </div>
    </section>
  );
}
