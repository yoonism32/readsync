import { useState, useMemo, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import useSWR from 'swr';
import toast from 'react-hot-toast';
import { fetchNovels, coverUrl, novels as novelsApi, categories as categoriesApi, copyResumeLink, formatTimestamp } from '../api/client.js';
import { SMART_FILTERS } from '../lib/smartFilters.js';
import type { SmartFilterId } from '../lib/smartFilters.js';
import { ProgressBar } from '../components/ProgressBar.js';
import { StatusBadge } from '../components/StatusBadge.js';
import { DeviceBadge } from '../components/DeviceBadge.js';
import { Spinner } from '../components/Spinner.js';
import { StarIcon, CopyLinkIcon, MoreHorizIcon } from '../components/Icon.js';
import { BehindBadge } from '../components/BehindBadge.js';
import { HiatusBadge } from '../components/HiatusBadge.js';
import type { CategoryAssignment, Novel, NovelStatus } from '../types/index.js';

type Tab = 'all' | 'reading' | 'plan-to-read' | 'completed' | 'on-hold' | 'dropped';

const TABS: { id: Tab; label: string }[] = [
  { id: 'all',       label: 'All' },
  { id: 'reading',   label: 'Reading' },
  { id: 'completed', label: 'Completed' },
  { id: 'plan-to-read', label: 'Plan to Read' },
  { id: 'on-hold',   label: 'On Hold' },
  { id: 'dropped',   label: 'Dropped' },
];

export function MyList() {
  const [tab, setTab] = useState<Tab>('reading');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'recent' | 'title' | 'progress'>('recent');
  const [smartFilter, setSmartFilter] = useState<SmartFilterId | null>(null);
  const [tagFilter, setTagFilter] = useState<string>('');

  const { data, isLoading, mutate } = useSWR<Novel[]>(
    '/novels',
    fetchNovels,
    { revalidateOnFocus: false }
  );
  const { data: tagData } = useSWR<CategoryAssignment[]>(
    'categories-all',
    () => categoriesApi.all(),
    { revalidateOnFocus: false }
  );

  const novels = data ?? [];

  const tagCounts = useMemo(() => {
    const c = new Map<string, number>();
    for (const a of tagData ?? []) c.set(a.category, (c.get(a.category) ?? 0) + 1);
    return [...c.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [tagData]);

  const taggedNovelIds = useMemo(() => {
    if (!tagFilter) return null;
    return new Set(
      (tagData ?? []).filter(a => a.category === tagFilter).map(a => a.novel_id),
    );
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
    if (sortBy === 'title')    list = [...list].sort((a, b) => a.title.localeCompare(b.title));
    if (sortBy === 'progress') list = [...list].sort((a, b) => (b.latest_percent ?? 0) - (a.latest_percent ?? 0));
    if (sortBy === 'recent')   list = [...list].sort((a, b) =>
      new Date(b.latest_read_at ?? 0).getTime() - new Date(a.latest_read_at ?? 0).getTime()
    );
    return list;
  }, [novels, tab, search, sortBy, smartFilter, taggedNovelIds]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: 0 };
    for (const n of novels) {
      if (n.status === 'removed') continue;
      c.all = (c.all ?? 0) + 1;
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

  async function toggleFav(novelId: string, current: boolean) {
    try {
      await novelsApi.setFavorite(novelId, !current);
      await mutate();
    } catch {
      toast.error('Failed to update');
    }
  }

  async function handleCopyResume(novel: Novel) {
    if (!novel.latest_url) return;
    await copyResumeLink(novel.latest_url, novel.latest_percent ?? 0);
    toast.success('Resume link copied');
  }

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '80px 0' }}>
        <Spinner size={32} />
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div style={{ marginBottom: 20, display: 'flex', alignItems: 'baseline', gap: 12 }}>
        <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 700 }}>My List</h1>
        <span className="text-muted" style={{ fontSize: 'var(--text-sm)' }}>
          {counts.all ?? 0} novels
        </span>
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        {/* Search */}
        <input
          type="search"
          placeholder="Search titles…"
          autoComplete="off"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            flex: '1 1 200px',
            background: 'var(--color-bg-input)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-md)',
            padding: '7px 12px',
            color: 'var(--color-text)',
            fontSize: 'var(--text-sm)',
            outline: 'none',
          }}
          onFocus={e => (e.target.style.borderColor = 'var(--color-gold)')}
          onBlur={e => (e.target.style.borderColor = 'var(--color-border)')}
        />
        {/* Sort */}
        <select
          value={sortBy}
          onChange={e => setSortBy(e.target.value as typeof sortBy)}
          aria-label="Sort by"
          style={{
            background: 'var(--color-bg-input)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-md)',
            padding: '7px 10px',
            color: 'var(--color-text)',
            fontSize: 'var(--text-sm)',
            cursor: 'pointer',
            outline: 'none',
          }}
        >
          <option value="recent">Recent</option>
          <option value="title">Title A–Z</option>
          <option value="progress">Progress</option>
        </select>
      </div>

      {/* Tabs */}
      <div
        role="tablist"
        aria-label="Filter by status"
        style={{ display: 'flex', gap: 4, marginBottom: 16, overflowX: 'auto', scrollbarWidth: 'none' }}
      >
        {TABS.map(t => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            style={{
              padding: '5px 12px',
              minHeight: 36,
              borderRadius: 'var(--radius-full)',
              border: tab === t.id ? '1px solid var(--color-border-gold)' : '1px solid var(--color-border)',
              background: tab === t.id ? 'var(--color-gold-glow)' : 'transparent',
              color: tab === t.id ? 'var(--color-gold)' : 'var(--color-text-muted)',
              fontSize: 'var(--text-sm)',
              fontWeight: 500,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              transition: 'all 0.15s',
              touchAction: 'manipulation',
            }}
          >
            {t.label}
            {counts[t.id] != null && (
              <span
                style={{
                  marginLeft: 6,
                  fontSize: 'var(--text-xs)',
                  opacity: 0.7,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {counts[t.id]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Smart filters + tag filter */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        {SMART_FILTERS.map(f => {
          const active = smartFilter === f.id;
          return (
            <button
              key={f.id}
              onClick={() => setSmartFilter(active ? null : f.id)}
              title={f.description}
              aria-pressed={active}
              style={{
                padding: '3px 10px',
                borderRadius: 'var(--radius-full)',
                border: active ? '1px solid var(--color-gold)' : '1px dashed var(--color-border)',
                background: active ? 'var(--color-gold-glow)' : 'transparent',
                color: active ? 'var(--color-gold)' : 'var(--color-text-faint)',
                fontSize: 'var(--text-xs)',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'all 0.15s',
                touchAction: 'manipulation',
              }}
            >
              {f.label}
            </button>
          );
        })}

        {tagCounts.length > 0 && (
          <select
            value={tagFilter}
            onChange={e => setTagFilter(e.target.value)}
            aria-label="Filter by tag"
            style={{
              marginLeft: 'auto',
              background: 'var(--color-bg-input)',
              border: tagFilter ? '1px solid var(--color-gold)' : '1px solid var(--color-border)',
              borderRadius: 'var(--radius-full)',
              padding: '3px 10px',
              color: tagFilter ? 'var(--color-gold)' : 'var(--color-text-muted)',
              fontSize: 'var(--text-xs)',
              cursor: 'pointer',
              outline: 'none',
            }}
          >
            <option value="">All tags</option>
            {tagCounts.map(([tag, count]) => (
              <option key={tag} value={tag}>
                {tag} ({count})
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Novel list */}
      {filtered.length === 0 ? (
        <div
          className="glass"
          style={{
            borderRadius: 'var(--radius-xl)',
            padding: '48px 24px',
            textAlign: 'center',
            color: 'var(--color-text-muted)',
          }}
        >
          {search
            ? `No novels matching "${search}"`
            : smartFilter || tagFilter
              ? 'No novels match the active filters.'
              : 'No novels here yet.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {filtered.map((novel, i) => (
            <NovelRow
              key={novel.novel_id}
              novel={novel}
              animDelay={Math.min(i * 30, 200)}
              onSetStatus={setStatus}
              onToggleFav={toggleFav}
              onCopyResume={handleCopyResume}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Novel row ─────────────────────────────────────────────

interface RowProps {
  novel: Novel;
  animDelay: number;
  onSetStatus: (id: string, s: NovelStatus) => void;
  onToggleFav: (id: string, current: boolean) => void;
  onCopyResume: (novel: Novel) => void;
}

function NovelRow({ novel, animDelay, onSetStatus, onToggleFav, onCopyResume }: RowProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  const chapterStr = novel.latest_chapter != null ? `Ch. ${novel.latest_chapter}` : null;
  const latestStr = novel.latest_chapter_num != null ? `/ ${novel.latest_chapter_num}` : '';

  return (
    <div
      className="animate-fade-in"
      style={{
        animationDelay: `${animDelay}ms`,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '10px 14px',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid transparent',
        transition: 'background 0.15s, border-color 0.15s',
        cursor: 'default',
        position: 'relative',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.background = 'var(--color-bg-hover)';
        e.currentTarget.style.borderColor = 'var(--color-border)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = 'transparent';
        e.currentTarget.style.borderColor = 'transparent';
      }}
    >
      {/* Cover */}
      <a
        href={novel.latest_url ?? novel.primary_url ?? '#'}
        target="_blank"
        rel="noopener noreferrer"
        style={{ flexShrink: 0 }}
        aria-label={`Open ${novel.title} on site`}
      >
        <div
          style={{
            position: 'relative',
            width: 36,
            height: 50,
            borderRadius: 4,
            overflow: 'hidden',
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid var(--color-border)',
          }}
        >
          <div
            style={{
              width: '100%', height: '100%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 16, color: 'var(--color-text-faint)',
            }}
            aria-hidden="true"
          >
            📖
          </div>
          <img
            src={coverUrl(novel.novel_id)}
            alt=""
            width={36}
            height={50}
            loading="lazy"
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
            style={{
              position: 'absolute', inset: 0,
              width: '100%', height: '100%', objectFit: 'cover',
            }}
          />
        </div>
      </a>

      {/* Main info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
          <Link
            to={`/novel/${encodeURIComponent(novel.novel_id)}`}
            style={{
              fontWeight: 600,
              fontSize: 'var(--text-sm)',
              color: 'var(--color-text)',
              transition: 'color 0.15s',
              textDecoration: 'none',
            }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-gold)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-text)')}
          >
            {novel.title}
          </Link>
          {novel.favorite && (
            <StarIcon size={11} filled style={{ color: 'var(--color-gold)', flexShrink: 0 }} />
          )}
        </div>

        {/* Chapter + progress */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
          {chapterStr && (
            <span className="tabular text-muted" style={{ fontSize: 'var(--text-xs)', flexShrink: 0 }}>
              {chapterStr}{latestStr}
            </span>
          )}
          <BehindBadge novel={novel} />
          <HiatusBadge novel={novel} />
          <ProgressBar
            percent={novel.latest_percent ?? 0}
            size="sm"
            className="flex-1"
            showLabel
          />
        </div>

        {/* Meta */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
          <StatusBadge status={novel.status} />
          {novel.latest_device_label && (
            <DeviceBadge label={novel.latest_device_label} />
          )}
          {novel.latest_read_at && (
            <span className="text-faint" style={{ fontSize: 'var(--text-xs)' }}>
              {formatTimestamp(novel.latest_read_at)}
            </span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
        {/* Copy resume */}
        {novel.latest_url && (
          <button
            onClick={() => { void onCopyResume(novel); }}
            aria-label="Copy resume link"
            title="Copy resume link"
            style={iconBtn}
          >
            <CopyLinkIcon size={14} />
          </button>
        )}

        {/* Favorite toggle */}
        <button
          onClick={() => { void onToggleFav(novel.novel_id, novel.favorite); }}
          aria-label={novel.favorite ? 'Remove from favorites' : 'Add to favorites'}
          title={novel.favorite ? 'Unfavorite' : 'Favorite'}
          style={{ ...iconBtn, color: novel.favorite ? 'var(--color-gold)' : 'var(--color-text-faint)' }}
        >
          <StarIcon size={14} filled={novel.favorite} />
        </button>

        {/* Status menu */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setMenuOpen(p => !p)}
            aria-label="Change status"
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            title="Change status"
            style={iconBtn}
          >
            <MoreHorizIcon size={14} />
          </button>
          {menuOpen && (
            <StatusMenu
              current={novel.status}
              onSelect={s => { onSetStatus(novel.novel_id, s); setMenuOpen(false); }}
              onClose={() => setMenuOpen(false)}
            />
          )}
        </div>
      </div>
    </div>
  );
}

const iconBtn: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  color: 'var(--color-text-muted)',
  width: 32,
  height: 32,
  padding: 0,
  borderRadius: 'var(--radius-sm)',
  transition: 'color 0.15s, background 0.15s',
  touchAction: 'manipulation',
};

// ── Status dropdown ───────────────────────────────────────

interface MenuProps {
  current: NovelStatus;
  onSelect: (s: NovelStatus) => void;
  onClose: () => void;
}

const STATUS_OPTIONS: NovelStatus[] = ['reading', 'plan-to-read', 'completed', 'on-hold', 'dropped', 'removed'];

function StatusMenu({ current, onSelect, onClose }: MenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <>
      {/* Backdrop */}
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 100 }}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={menuRef}
        role="menu"
        style={{
          position: 'absolute',
          right: 0,
          top: '100%',
          marginTop: 4,
          zIndex: 101,
          background: 'var(--color-bg-raised)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-lg)',
          padding: 4,
          minWidth: 140,
          boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
        }}
      >
        {STATUS_OPTIONS.map(s => (
          <button
            key={s}
            role="menuitem"
            onClick={() => onSelect(s)}
            style={{
              display: 'block',
              width: '100%',
              textAlign: 'left',
              background: s === current ? 'rgba(255,255,255,0.06)' : 'none',
              border: 'none',
              borderRadius: 'var(--radius-md)',
              padding: '7px 10px',
              color: s === current ? 'var(--color-text)' : 'var(--color-text-muted)',
              fontSize: 'var(--text-sm)',
              cursor: 'pointer',
              fontWeight: s === current ? 600 : 400,
              touchAction: 'manipulation',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
            onMouseLeave={e => (e.currentTarget.style.background = s === current ? 'rgba(255,255,255,0.06)' : 'none')}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>
    </>
  );
}
