import { useMemo, useState } from 'react';
import useSWR from 'swr';
import toast from 'react-hot-toast';
import { fetchNovels, novels as novelsApi, categories as categoriesApi } from '../api/client.js';
import { RefreshIcon, BellIcon } from '../components/Icon.js';
import { Spinner } from '../components/Spinner.js';
import { Th, Row } from '../components/MyListTable.js';
import { useRefreshAll } from '../hooks/useRefreshAll.js';
import { lastRefreshLabel, describeFailure } from '../lib/refreshStatus.js';
import { SMART_FILTERS } from '../lib/smartFilters.js';
import type { SmartFilterId } from '../lib/smartFilters.js';
import { compareNovels } from '../lib/novelSort.js';
import type { SortKey } from '../lib/novelSort.js';
import type { CategoryAssignment, Novel, NovelStatus } from '../types/index.js';

type Tab = 'all' | 'reading' | 'plan-to-read' | 'completed' | 'on-hold' | 'dropped';

const TABS: { id: Tab; label: string }[] = [
  { id: 'all',          label: 'All' },
  { id: 'reading',      label: 'Reading' },
  { id: 'completed',    label: 'Completed' },
  { id: 'plan-to-read', label: 'Plan to Read' },
  { id: 'on-hold',      label: 'On Hold' },
  { id: 'dropped',      label: 'Dropped' },
];

const PAGE_SIZE = 50;

// Sorting moved to lib/novelSort so Explorer sorts by the same rules.

export function MyList() {
  const [tab, setTab] = useState<Tab>('all');
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('last_read');
  const [sortAsc, setSortAsc] = useState(false);
  // Which metric the Progress column header sorts by — defaults to
  // completion ratio ("how close to done"), not raw chapters read, since
  // that's what a column literally labeled "Progress" implies.
  const [progressMode, setProgressMode] = useState<SortKey>('completion');
  const [smartFilter, setSmartFilter] = useState<SmartFilterId | null>(null);
  const [tagFilter, setTagFilter] = useState('');
  const [page, setPage] = useState(1);
  const [showFailures, setShowFailures] = useState(false);

  // Live updates come from the socket in Layout.tsx (chapters:updated /
  // progress:updated → mutate('/novels')); this 30-minute interval is only a
  // safety net if a tab's socket dies silently. See docs/ARCHITECTURE.md.
  const { data, isLoading, mutate } = useSWR<Novel[]>('/novels', fetchNovels, {
    revalidateOnFocus: false,
    refreshInterval: 30 * 60_000,
  });
  const { data: tagData } = useSWR<CategoryAssignment[]>('categories-all', () => categoriesApi.all(), { revalidateOnFocus: false });
  const refresh = useRefreshAll();

  const novels = data ?? [];

  const tagCounts = useMemo(() => {
    const c = new Map<string, number>();
    for (const a of tagData ?? []) c.set(a.category, (c.get(a.category) ?? 0) + 1);
    return [...c.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [tagData]);

  const taggedNovelIds = useMemo(() => {
    if (!tagFilter) return null;
    return new Set((tagData ?? []).filter(a => a.category === tagFilter).map(a => a.novel_id));
  }, [tagData, tagFilter]);

  const filtered = useMemo(() => {
    const now = new Date();
    let list = novels.filter(n => n.status !== 'removed');
    if (tab !== 'all') list = list.filter(n => n.status === tab);
    if (smartFilter) {
      const f = SMART_FILTERS.find(f => f.id === smartFilter);
      if (f) list = list.filter(n => f.predicate(n, now));
    }
    if (taggedNovelIds) list = list.filter(n => taggedNovelIds.has(n.novel_id));
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(n => n.title.toLowerCase().includes(q));
    }
    return [...list].sort((a, b) => compareNovels(a, b, sortKey, sortAsc));
  }, [novels, tab, search, sortKey, sortAsc, smartFilter, taggedNovelIds]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: 0 };
    for (const n of novels) {
      if (n.status === 'removed') continue;
      c.all += 1;
      c[n.status] = (c[n.status] ?? 0) + 1;
    }
    return c;
  }, [novels]);

  async function setStatus(novelId: string, status: NovelStatus) {
    try {
      await novelsApi.setStatus(novelId, status);
      await mutate();
      // Silent success: the row's status cell updates in place.
    } catch {
      toast.error('Failed to update status');
    }
  }

  async function toggleFav(novel: Novel) {
    try {
      await novelsApi.setFavorite(novel.novel_id, !novel.favorite);
      await mutate();
    } catch {
      toast.error('Failed to update');
    }
  }

  const changeSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(a => !a);
    else {
      setSortKey(key);
      setSortAsc(key === 'title');
    }
    setPage(1);
  };

  /** Swaps what "Progress" means (completion % vs. raw chapters read). If
   *  that column is the one currently driving the sort, re-sort immediately
   *  in the same direction; otherwise just remember the choice for next click. */
  const toggleProgressMode = () => {
    const next: SortKey = progressMode === 'completion' ? 'progress' : 'completion';
    setProgressMode(next);
    if (sortKey === 'completion' || sortKey === 'progress') {
      setSortKey(next);
      setPage(1);
    }
  };

  if (isLoading) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: '80px 0' }}><Spinner size={32} /></div>;
  }

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div style={{ marginBottom: 6 }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-3xl)', fontWeight: 600, letterSpacing: '-0.01em' }}>
          My List
        </h1>
        <p className="text-muted" style={{ fontSize: 'var(--text-sm)', marginTop: 2 }}>
          {counts.all ?? 0} novels tracked on NovelArrow.
        </p>
      </div>

      {/* Refresh All bar */}
      <div
        className="panel"
        style={{
          display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
          borderRadius: 'var(--radius-lg)', padding: '12px 16px', margin: '14px 0 18px',
          border: '1px solid var(--color-teal-border)',
        }}
      >
        <button
          type="button"
          onClick={() => { void refresh.refreshAll(novels); }}
          disabled={refresh.isRefreshing}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            background: refresh.isRefreshing ? 'var(--color-teal-glow)' : 'var(--color-teal)',
            color: refresh.isRefreshing ? 'var(--color-teal)' : 'var(--color-on-teal)',
            border: 'none', borderRadius: 'var(--radius-md)', padding: '9px 16px',
            fontWeight: 600, fontSize: 'var(--text-sm)', cursor: refresh.isRefreshing ? 'default' : 'pointer',
            touchAction: 'manipulation',
          }}
        >
          <RefreshIcon size={14} className={refresh.isRefreshing ? 'animate-spin' : ''} />
          {refresh.isRefreshing
            ? `Refreshing ${refresh.progress?.done ?? 0}/${refresh.progress?.total ?? 0}…`
            : 'Refresh All Novels'}
        </button>
        {refresh.summary && !refresh.isRefreshing && (
          refresh.failures.length > 0 ? (
            <button
              type="button"
              onClick={() => setShowFailures(v => !v)}
              aria-expanded={showFailures}
              style={{
                background: 'none', border: 'none', padding: 0,
                fontSize: 'var(--text-sm)', color: 'var(--color-warning)',
                cursor: 'pointer', textAlign: 'left',
              }}
            >
              {refresh.summary} {showFailures ? '▾' : '▸'}
            </button>
          ) : (
            <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-teal)' }}>{refresh.summary}</span>
          )
        )}
        <span style={{ flex: 1 }} />
        <span className="text-muted" style={{ fontSize: 'var(--text-xs)', textAlign: 'right' }}>
          Last: {lastRefreshLabel(refresh.lastRefresh)}
          {refresh.needsRefresh ? (
            <span
              style={{
                // inline-flex, not block: the bare SVG sat on the text baseline
                // and floated above the label instead of beside it.
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
                gap: 4,
                color: 'var(--color-warning)',
                fontWeight: 600,
              }}
            >
              <BellIcon size={11} /> Time to refresh
            </span>
          ) : refresh.minutesUntilDue != null ? (
            <span style={{ display: 'block' }}>Next: {Math.floor(refresh.minutesUntilDue / 60)}h {refresh.minutesUntilDue % 60}m</span>
          ) : null}
        </span>
        {showFailures && refresh.failures.length > 0 && !refresh.isRefreshing && (
          <ul
            style={{
              flexBasis: '100%', listStyle: 'none', margin: 0,
              padding: '10px 0 2px', borderTop: '1px solid var(--color-border)',
              display: 'flex', flexDirection: 'column', gap: 6,
            }}
          >
            {refresh.failures.map(f => (
              <li key={f.novelId} style={{ fontSize: 'var(--text-xs)' }}>
                <span style={{ fontWeight: 600 }}>{f.title}</span>
                <span className="text-muted"> — {describeFailure(f.reason)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Search + tabs + filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <input
          type="search"
          placeholder="Search titles…"
          autoComplete="off"
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
          className="input"
          style={{
            flex: '1 1 220px', background: 'var(--color-bg-input)',
            border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)',
            padding: '8px 12px', color: 'var(--color-text)', fontSize: 'var(--text-sm)', outline: 'none',
          }}
        />
        {tagCounts.length > 0 && (
          <select
            value={tagFilter}
            onChange={e => { setTagFilter(e.target.value); setPage(1); }}
            aria-label="Filter by tag"
            style={{
              background: 'var(--color-bg-input)',
              border: tagFilter ? '1px solid var(--color-accent)' : '1px solid var(--color-border)',
              borderRadius: 'var(--radius-md)', padding: '8px 10px',
              color: tagFilter ? 'var(--color-accent)' : 'var(--color-text-muted)',
              fontSize: 'var(--text-sm)', cursor: 'pointer', outline: 'none',
            }}
          >
            <option value="">All tags</option>
            {tagCounts.map(([tag, count]) => (
              <option key={tag} value={tag}>{tag} ({count})</option>
            ))}
          </select>
        )}
      </div>

      <div role="tablist" aria-label="Filter by status" style={{ display: 'flex', gap: 4, marginBottom: 10, overflowX: 'auto', scrollbarWidth: 'none' }}>
        {TABS.map(t => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => { setTab(t.id); setPage(1); }}
            style={{
              padding: '5px 13px', minHeight: 36, borderRadius: 'var(--radius-full)',
              border: tab === t.id ? '1px solid var(--color-accent-border)' : '1px solid var(--color-border)',
              background: tab === t.id ? 'var(--color-accent-glow)' : 'transparent',
              color: tab === t.id ? 'var(--color-accent-bright)' : 'var(--color-text-muted)',
              fontSize: 'var(--text-sm)', fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap',
              transition: 'border-color 150ms var(--ease-out-expo), background-color 150ms var(--ease-out-expo), color 150ms var(--ease-out-expo)', touchAction: 'manipulation',
            }}
          >
            {t.label}
            {counts[t.id] != null && (
              <span className="tabular" style={{ marginLeft: 6, fontSize: 'var(--text-xs)', opacity: 0.7 }}>{counts[t.id]}</span>
            )}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 14, alignItems: 'center', flexWrap: 'wrap' }}>
        {SMART_FILTERS.map(f => {
          const active = smartFilter === f.id;
          return (
            <button
              key={f.id}
              onClick={() => { setSmartFilter(active ? null : f.id); setPage(1); }}
              title={f.description}
              aria-pressed={active}
              style={{
                padding: '3px 11px', borderRadius: 'var(--radius-full)',
                border: active ? '1px solid var(--color-teal-border)' : '1px dashed var(--color-border)',
                background: active ? 'var(--color-teal-glow)' : 'transparent',
                color: active ? 'var(--color-teal)' : 'var(--color-text-faint)',
                fontSize: 'var(--text-xs)', cursor: 'pointer', whiteSpace: 'nowrap',
                transition: 'border-color 150ms var(--ease-out-expo), background-color 150ms var(--ease-out-expo), color 150ms var(--ease-out-expo)', touchAction: 'manipulation',
              }}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="panel" style={{ borderRadius: 'var(--radius-xl)', padding: '48px 24px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
          {search ? `No novels matching "${search}"` : smartFilter || tagFilter ? 'No novels match the active filters.' : 'No novels here yet.'}
        </div>
      ) : (
        <>
          <div className="panel" style={{ borderRadius: 'var(--radius-xl)', overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1100 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <Th label="Cover" />
                    <Th label="Title" sortable active={sortKey === 'title'} asc={sortAsc} onClick={() => changeSort('title')} align="left" />
                    <Th
                      label="Progress"
                      sortable
                      active={sortKey === progressMode}
                      asc={sortAsc}
                      onClick={() => changeSort(progressMode)}
                      toggle={{
                        active: progressMode === 'progress',
                        symbol: progressMode === 'completion' ? '#' : '%',
                        title: progressMode === 'completion'
                          ? 'Sorting by % complete — click to sort by chapters read instead'
                          : 'Sorting by chapters read — click to sort by % complete instead',
                        onClick: toggleProgressMode,
                      }}
                    />
                    <Th label="Continue" />
                    <Th label="Status" />
                    <Th label="Last read" sortable active={sortKey === 'last_read'} asc={sortAsc} onClick={() => changeSort('last_read')} />
                    <Th label="Updated" sortable active={sortKey === 'updated'} asc={sortAsc} onClick={() => changeSort('updated')} />
                    <Th label="Added" sortable active={sortKey === 'added'} asc={sortAsc} onClick={() => changeSort('added')} />
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map(n => (
                    <Row key={n.novel_id} novel={n} onSetStatus={setStatus} onToggleFav={toggleFav} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 14, flexWrap: 'wrap' }}>
            <span className="text-muted tabular" style={{ fontSize: 'var(--text-sm)' }}>
              Showing {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filtered.length)} of {filtered.length} novels
            </span>
            <span style={{ flex: 1 }} />
            <button type="button" className="btn-ghost" disabled={safePage <= 1} onClick={() => setPage(p => p - 1)}>← Previous</button>
            <span className="text-muted tabular" style={{ fontSize: 'var(--text-sm)' }}>Page {safePage} of {pageCount}</span>
            <button
              type="button"
              disabled={safePage >= pageCount}
              onClick={() => setPage(p => p + 1)}
              className="btn-accent"
            >
              Next →
            </button>
          </div>
        </>
      )}
    </div>
  );
}
