import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import useSWR from 'swr';
import toast from 'react-hot-toast';
import { fetchNovels, coverUrl, resumeUrl, novels as novelsApi, categories as categoriesApi } from '../api/client.js';
import { behindCount } from '../components/BehindBadge.js';
import { HiatusBadge } from '../components/HiatusBadge.js';
import { StarIcon } from '../components/Icon.js';
import { Spinner } from '../components/Spinner.js';
import { useRefreshAll } from '../hooks/useRefreshAll.js';
import { SMART_FILTERS } from '../lib/smartFilters.js';
import type { SmartFilterId } from '../lib/smartFilters.js';
import type { CategoryAssignment, Novel, NovelStatus } from '../types/index.js';

type Tab = 'all' | 'reading' | 'plan-to-read' | 'completed' | 'on-hold' | 'dropped';
type SortKey = 'last_read' | 'title' | 'progress' | 'updated' | 'added';

const TABS: { id: Tab; label: string }[] = [
  { id: 'all',          label: 'All' },
  { id: 'reading',      label: 'Reading' },
  { id: 'completed',    label: 'Completed' },
  { id: 'plan-to-read', label: 'Plan to Read' },
  { id: 'on-hold',      label: 'On Hold' },
  { id: 'dropped',      label: 'Dropped' },
];

const STATUS_OPTIONS: NovelStatus[] = ['reading', 'plan-to-read', 'completed', 'on-hold', 'dropped', 'removed'];
const PAGE_SIZE = 50;

/* Compact relative age, legacy style: 12h · 3d · 4mo */
export function compactAge(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return '—';
  const ms = now - new Date(iso).getTime();
  if (Number.isNaN(ms) || ms < 0) return '—';
  const m = Math.floor(ms / 60_000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo`;
  return `${Math.floor(mo / 12)}y`;
}

function lastRefreshLabel(iso: string | null): string {
  if (!iso) return 'never';
  const ms = Date.now() - new Date(iso).getTime();
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return h > 0 ? `${h}h ${m}m ago` : `${m}m ago`;
}

const ordinal = (n: number): string =>
  n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`;

const updatedAt = (n: Novel): string | null => n.site_latest_chapter_time ?? n.chapters_updated_at;

function sortValue(n: Novel, key: SortKey): number | string {
  switch (key) {
    case 'title':     return n.title.toLowerCase();
    case 'progress':  return n.latest_chapter ?? -1;
    case 'last_read': return n.latest_read_at ? new Date(n.latest_read_at).getTime() : 0;
    case 'updated':   { const u = updatedAt(n); return u ? new Date(u).getTime() : 0; }
    case 'added':     return n.started_at ? new Date(n.started_at).getTime() : 0;
  }
}

export function MyList() {
  const [tab, setTab] = useState<Tab>('all');
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('last_read');
  const [sortAsc, setSortAsc] = useState(false);
  const [smartFilter, setSmartFilter] = useState<SmartFilterId | null>(null);
  const [tagFilter, setTagFilter] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading, mutate } = useSWR<Novel[]>('/novels', fetchNovels, { revalidateOnFocus: false });
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
    const dir = sortAsc ? 1 : -1;
    return [...list].sort((a, b) => {
      const va = sortValue(a, sortKey);
      const vb = sortValue(b, sortKey);
      if (va < vb) return -dir;
      if (va > vb) return dir;
      return 0;
    });
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
      toast.success(`Moved to ${status}`);
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
        className="glass"
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
            color: refresh.isRefreshing ? 'var(--color-teal)' : '#07110f',
            border: 'none', borderRadius: 'var(--radius-md)', padding: '9px 16px',
            fontWeight: 600, fontSize: 'var(--text-sm)', cursor: refresh.isRefreshing ? 'default' : 'pointer',
            touchAction: 'manipulation',
          }}
        >
          🔄 {refresh.isRefreshing
            ? `Refreshing ${refresh.progress?.done ?? 0}/${refresh.progress?.total ?? 0}…`
            : 'Refresh All Novels'}
        </button>
        {refresh.summary && !refresh.isRefreshing && (
          <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-teal)' }}>{refresh.summary}</span>
        )}
        <span style={{ flex: 1 }} />
        <span className="text-muted" style={{ fontSize: 'var(--text-xs)', textAlign: 'right' }}>
          Last: {lastRefreshLabel(refresh.lastRefresh)}
          {refresh.needsRefresh && (
            <span style={{ display: 'block', color: 'var(--color-warning)' }}>🔔 Time to refresh!</span>
          )}
        </span>
      </div>

      {/* Search + tabs + filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <input
          type="search"
          placeholder="Search titles…"
          autoComplete="off"
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
          style={{
            flex: '1 1 220px', background: 'var(--color-bg-input)',
            border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)',
            padding: '8px 12px', color: 'var(--color-text)', fontSize: 'var(--text-sm)', outline: 'none',
          }}
          onFocus={e => (e.target.style.borderColor = 'var(--color-accent)')}
          onBlur={e => (e.target.style.borderColor = 'var(--color-border)')}
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
              transition: 'all 0.15s', touchAction: 'manipulation',
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
                transition: 'all 0.15s', touchAction: 'manipulation',
              }}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="glass" style={{ borderRadius: 'var(--radius-xl)', padding: '48px 24px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
          {search ? `No novels matching "${search}"` : smartFilter || tagFilter ? 'No novels match the active filters.' : 'No novels here yet.'}
        </div>
      ) : (
        <>
          <div className="glass" style={{ borderRadius: 'var(--radius-xl)', overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 880 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <Th label="Cover" />
                    <Th label="Title" sortable active={sortKey === 'title'} asc={sortAsc} onClick={() => changeSort('title')} align="left" />
                    <Th label="Progress" sortable active={sortKey === 'progress'} asc={sortAsc} onClick={() => changeSort('progress')} />
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

/* ── Table pieces ─────────────────────────────────────────── */

function Th({ label, sortable, active, asc, onClick, align = 'center' }: {
  label: string; sortable?: boolean; active?: boolean; asc?: boolean;
  onClick?: () => void; align?: 'left' | 'center';
}) {
  return (
    <th
      onClick={sortable ? onClick : undefined}
      style={{
        padding: '10px 12px', textAlign: align, whiteSpace: 'nowrap',
        fontSize: 'var(--text-xs)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em',
        color: active ? 'var(--color-accent-bright)' : 'var(--color-text-muted)',
        cursor: sortable ? 'pointer' : 'default', userSelect: 'none',
      }}
    >
      {label}{active && (asc ? ' ▲' : ' ▼')}
    </th>
  );
}

function Row({ novel: n, onSetStatus, onToggleFav }: {
  novel: Novel;
  onSetStatus: (id: string, s: NovelStatus) => void;
  onToggleFav: (n: Novel) => void;
}) {
  const behind = behindCount(n);
  const continueHref = n.latest_url
    ? resumeUrl(n.latest_url, n.latest_percent)
    : n.primary_url ?? null;

  const td: React.CSSProperties = { padding: '10px 12px', textAlign: 'center', whiteSpace: 'nowrap' };

  return (
    <tr
      style={{ borderBottom: '1px solid var(--color-border)', transition: 'background 0.12s' }}
      onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-bg-hover)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
    >
      {/* Cover */}
      <td style={{ ...td, width: 52 }}>
        <a href={continueHref ?? '#'} target="_blank" rel="noopener noreferrer" aria-label={`Open ${n.title} on site`}>
          <span style={{
            position: 'relative', display: 'inline-block', width: 38, height: 54, borderRadius: 4,
            overflow: 'hidden', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--color-border)', verticalAlign: 'middle',
          }}>
            <img
              src={coverUrl(n.novel_id)} alt="" width={38} height={54} loading="lazy"
              onError={e => { e.currentTarget.style.display = 'none'; }}
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
            />
          </span>
        </a>
      </td>

      {/* Title */}
      <td style={{ ...td, textAlign: 'left', whiteSpace: 'normal', minWidth: 220, maxWidth: 380 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
          <Link
            to={`/novel/${encodeURIComponent(n.novel_id)}`}
            style={{ fontWeight: 600, fontSize: 'var(--text-sm)', color: 'var(--color-text)', textDecoration: 'none', transition: 'color 0.15s' }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-accent-bright)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-text)')}
          >
            {n.title}
          </Link>
          <button
            type="button"
            onClick={() => onToggleFav(n)}
            aria-label={n.favorite ? 'Unfavorite' : 'Favorite'}
            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: n.favorite ? 'var(--color-warning)' : 'var(--color-text-faint)', lineHeight: 1 }}
          >
            <StarIcon size={12} filled={n.favorite} />
          </button>
          {(n.current_read_through ?? 1) > 1 && (
            <span style={{
              fontSize: 'var(--text-xs)', color: 'var(--color-accent-bright)', background: 'var(--color-accent-glow)',
              border: '1px solid var(--color-accent-border)', borderRadius: 'var(--radius-full)', padding: '0 8px',
            }}>
              {ordinal(n.current_read_through)} read
            </span>
          )}
          {behind > 0 && (
            <span className="tabular" style={{
              fontSize: 'var(--text-xs)', fontWeight: 600, color: '#07110f',
              background: 'var(--color-teal)', borderRadius: 'var(--radius-full)', padding: '1px 8px',
            }}>
              +{behind}
            </span>
          )}
          <HiatusBadge novel={n} />
        </span>
        {n.latest_chapter != null && (
          <span className="text-muted" style={{ display: 'block', fontSize: 'var(--text-xs)', marginTop: 3 }}>
            <span style={{ color: 'var(--color-accent)' }}>●</span> Last ch. {n.latest_chapter}
          </span>
        )}
      </td>

      {/* Progress */}
      <td className="tabular" style={{ ...td, fontSize: 'var(--text-sm)' }}>
        {n.latest_chapter ?? 0} / {n.latest_chapter_num ?? '?'}
      </td>

      {/* Continue */}
      <td style={td}>
        {continueHref ? (
          <a
            href={continueHref}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-accent"
            style={{ textDecoration: 'none', fontSize: 'var(--text-xs)', padding: '6px 12px', display: 'inline-block' }}
          >
            Continue Reading →
          </a>
        ) : (
          <span className="text-faint" style={{ fontSize: 'var(--text-xs)' }}>—</span>
        )}
      </td>

      {/* Status */}
      <td style={td}>
        <select
          value={n.status}
          onChange={e => onSetStatus(n.novel_id, e.target.value as NovelStatus)}
          aria-label={`Status of ${n.title}`}
          style={{
            background: 'var(--color-bg-input)', border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-md)', padding: '5px 8px',
            color: 'var(--color-text)', fontSize: 'var(--text-xs)', cursor: 'pointer', outline: 'none',
          }}
        >
          {STATUS_OPTIONS.map(s => (
            <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
          ))}
        </select>
      </td>

      {/* Times */}
      <td className="tabular text-muted" style={{ ...td, fontSize: 'var(--text-xs)' }}>{compactAge(n.latest_read_at)}</td>
      <td className="tabular text-muted" style={{ ...td, fontSize: 'var(--text-xs)' }}>{compactAge(updatedAt(n))}</td>
      <td className="tabular text-muted" style={{ ...td, fontSize: 'var(--text-xs)' }}>{compactAge(n.started_at)}</td>
    </tr>
  );
}
