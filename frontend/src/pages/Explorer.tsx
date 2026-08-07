import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import useSWR from 'swr';
import { fetchNovels, coverUrl, formatTimestamp } from '../api/client.js';
import { ProgressBar } from '../components/ProgressBar.js';
import { Spinner } from '../components/Spinner.js';
import { SearchIcon } from '../components/Icon.js';
import { FilterPopover } from '../components/FilterPopover.js';
import { TriCheckbox } from '../components/TriCheckbox.js';
import { SORT_OPTIONS, DEFAULT_SORT_ID, sortNovels } from '../lib/novelSort.js';
import {
  DEFAULT_FILTERS,
  STATUS_OPTIONS,
  UPDATED_WITHIN_OPTIONS,
  activeFilterCount,
  applyExplorerFilters,
  collectGenres,
  genreSummary,
  genresInState,
  nextTriState,
} from '../lib/explorerFilters.js';
import type { ExplorerFilters } from '../lib/explorerFilters.js';
import type { Novel } from '../types/index.js';

type ViewMode = 'grid' | 'list';

const fieldStyle: React.CSSProperties = {
  width: '100%',
  background: 'var(--color-bg-input)',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-md)',
  padding: '8px 10px',
  color: 'var(--color-text)',
  fontSize: 'var(--text-sm)',
  fontFamily: 'inherit',
  outline: 'none',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 'var(--text-xs)',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--color-text-faint)',
  marginBottom: 6,
};

export function Explorer() {
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<ExplorerFilters>(DEFAULT_FILTERS);
  const [sortId, setSortId] = useState(DEFAULT_SORT_ID);
  const [view, setView] = useState<ViewMode>('grid');
  const [panelOpen, setPanelOpen] = useState(false);

  // Polls so progress synced from other devices/tabs shows up without a
  // manual page reload — see docs/ARCHITECTURE.md.
  const { data, isLoading } = useSWR<Novel[]>('/novels', fetchNovels, {
    refreshInterval: 60_000,
  });
  const novels = useMemo(() => data ?? [], [data]);
  const genres = useMemo(() => collectGenres(novels), [novels]);
  const activeCount = activeFilterCount(filters);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const searched = q
      ? novels.filter(
        n =>
          n.title.toLowerCase().includes(q) ||
          (n.author ?? '').toLowerCase().includes(q) ||
          (n.genre ?? '').toLowerCase().includes(q),
      )
      : novels;

    return sortNovels(applyExplorerFilters(searched, filters), sortId);
  }, [novels, query, filters, sortId]);

  const set = <K extends keyof ExplorerFilters>(key: K, value: ExplorerFilters[K]) =>
    setFilters(f => ({ ...f, [key]: value }));

  // Cycles unset → include → exclude → unset, dropping the key entirely once
  // it returns to unset so the filter object stays a record of real choices.
  const cycleGenre = (genre: string) =>
    setFilters(f => {
      const next = nextTriState(f.genres[genre] ?? 'off');
      const genres = { ...f.genres };
      if (next === 'off') delete genres[genre];
      else genres[genre] = next;
      return { ...f, genres };
    });

  const genreActive =
    genresInState(filters, 'include').length > 0 || genresInState(filters, 'exclude').length > 0;

  return (
    <div className="animate-fade-in">
      <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, marginBottom: 20 }}>Explorer</h1>

      {/* Search + Filters trigger */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'stretch', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
          <span
            style={{
              position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
              color: 'var(--color-text-faint)', display: 'flex', pointerEvents: 'none',
            }}
          >
            <SearchIcon size={15} />
          </span>
          <input
            type="search"
            placeholder="Search titles…"
            autoComplete="off"
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="input"
            style={{ ...fieldStyle, borderRadius: 'var(--radius-lg)', padding: '11px 14px 11px 36px', fontSize: 'var(--text-base)' }}
          />
        </div>

        <button
          type="button"
          onClick={() => setPanelOpen(o => !o)}
          aria-expanded={panelOpen}
          aria-controls="explorer-filters"
          className="panel"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 9,
            borderRadius: 'var(--radius-lg)', padding: '0 18px',
            color: activeCount > 0 ? 'var(--color-accent)' : 'var(--color-text)',
            fontSize: 'var(--text-sm)', fontWeight: 600, fontFamily: 'inherit',
            cursor: 'pointer', touchAction: 'manipulation',
          }}
        >
          <FilterIcon size={15} />
          Filters
          {activeCount > 0 && (
            <span
              style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                minWidth: 19, height: 19, padding: '0 5px', borderRadius: 'var(--radius-full)',
                background: 'var(--color-accent)', color: 'var(--color-on-accent)',
                fontSize: 'var(--text-xs)', fontWeight: 700,
              }}
            >
              {activeCount}
            </span>
          )}
        </button>
      </div>

      {/* Filter panel */}
      {panelOpen && (
        <div
          id="explorer-filters"
          className="panel animate-fade-in"
          style={{
            borderRadius: 'var(--radius-xl)',
            padding: 20,
            marginTop: 12,
            // .glass applies backdrop-filter, which creates a stacking context.
            // That traps a popover's z-index inside this panel, so the panel
            // itself has to out-rank the results grid or the cards — which come
            // later in the DOM — paint over the open dropdown.
            position: 'relative',
            zIndex: 30,
          }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
              gap: 14,
            }}
          >
            <div>
              <span style={labelStyle}>Genres</span>
              <FilterPopover label={genreSummary(filters)} active={genreActive} panelWidth={420}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10, flexWrap: 'wrap' }}>
                  <span style={{ ...labelStyle, marginBottom: 0 }}>Inclusion mode</span>
                  {(['all', 'any'] as const).map(mode => (
                    <label key={mode} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 'var(--text-sm)', cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name="genre-mode"
                        checked={filters.genreMode === mode}
                        onChange={() => set('genreMode', mode)}
                      />
                      {mode === 'all' ? 'All' : 'Any'}
                    </label>
                  ))}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '2px 10px' }}>
                  {genres.map(g => (
                    <TriCheckbox
                      key={g}
                      label={g}
                      state={filters.genres[g] ?? 'off'}
                      onCycle={() => cycleGenre(g)}
                    />
                  ))}
                </div>

                {genres.length === 0 && (
                  <p className="text-muted" style={{ fontSize: 'var(--text-sm)' }}>No genres recorded yet.</p>
                )}
              </FilterPopover>
            </div>

            <div>
              <span style={labelStyle}>Status</span>
              <FilterPopover
                label={filters.statuses.length === 0
                  ? 'Any'
                  : filters.statuses.length === 1
                    ? (STATUS_OPTIONS.find(o => o.id === filters.statuses[0])?.label ?? 'Any')
                    : `${filters.statuses.length} selected`}
                active={filters.statuses.length > 0}
                panelWidth={220}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {STATUS_OPTIONS.map(o => (
                    <label key={o.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--text-sm)', padding: '4px 2px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={filters.statuses.includes(o.id)}
                        onChange={e =>
                          set('statuses', e.target.checked
                            ? [...filters.statuses, o.id]
                            : filters.statuses.filter(s => s !== o.id))
                        }
                      />
                      {o.label}
                    </label>
                  ))}
                </div>
              </FilterPopover>
            </div>

            <div>
              <label style={labelStyle} htmlFor="f-author">Author</label>
              <input id="f-author" type="text" placeholder="Search author…" autoComplete="off"
                value={filters.author} style={fieldStyle}
                onChange={e => set('author', e.target.value)} />
            </div>

            <div>
              <label style={labelStyle} htmlFor="f-minch">Minimum chapters</label>
              <input id="f-minch" type="number" min={0} placeholder="Any" inputMode="numeric"
                value={filters.minChapters} style={fieldStyle}
                onChange={e => set('minChapters', e.target.value)} />
            </div>

            <div>
              <span style={labelStyle}>Site updated</span>
              <FilterPopover
                label={UPDATED_WITHIN_OPTIONS.find(o => o.id === filters.updatedWithin)?.label ?? 'Any time'}
                active={filters.updatedWithin !== 'any'}
                panelWidth={220}
              >
                {close => (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {UPDATED_WITHIN_OPTIONS.map(o => (
                      <RadioRow
                        key={o.id}
                        name="updated-within"
                        label={o.label}
                        checked={filters.updatedWithin === o.id}
                        onSelect={() => { set('updatedWithin', o.id); close(); }}
                      />
                    ))}
                  </div>
                )}
              </FilterPopover>
            </div>

            <div>
              <span style={labelStyle}>Sort</span>
              <FilterPopover
                label={SORT_OPTIONS.find(o => o.id === sortId)?.label ?? 'Last read'}
                active={sortId !== DEFAULT_SORT_ID}
                panelWidth={250}
              >
                {close => (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {SORT_OPTIONS.map(o => (
                      <RadioRow
                        key={o.id}
                        name="sort"
                        label={o.label}
                        checked={sortId === o.id}
                        onSelect={() => { setSortId(o.id); close(); }}
                      />
                    ))}
                  </div>
                )}
              </FilterPopover>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 16, flexWrap: 'wrap' }}>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 'var(--text-sm)', cursor: 'pointer' }}>
              <input type="checkbox" checked={filters.favouritesOnly}
                onChange={e => set('favouritesOnly', e.target.checked)} />
              Favourites only
            </label>

            <span style={{ flex: 1 }} />

            <button type="button" className="btn-ghost"
              onClick={() => { setFilters(DEFAULT_FILTERS); setSortId(DEFAULT_SORT_ID); }}
              disabled={activeCount === 0 && sortId === DEFAULT_SORT_ID}>
              Reset filters
            </button>
          </div>
        </div>
      )}

      {/* Result count + view toggle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '18px 0 12px' }}>
        <span className="text-muted tabular" style={{ fontSize: 'var(--text-sm)' }}>
          {results.length} {results.length === 1 ? 'title' : 'titles'}
          {results.length !== novels.length && novels.length > 0 && (
            <span className="text-faint"> of {novels.length}</span>
          )}
        </span>
        <span style={{ flex: 1 }} />
        <div style={{ display: 'inline-flex', gap: 2, padding: 3, borderRadius: 'var(--radius-md)', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--color-border)' }}>
          <ViewButton mode="grid" active={view === 'grid'} onClick={() => setView('grid')} />
          <ViewButton mode="list" active={view === 'list'} onClick={() => setView('list')} />
        </div>
      </div>

      {isLoading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spinner size={28} /></div>
      ) : results.length === 0 ? (
        <p className="text-muted" style={{ fontSize: 'var(--text-sm)', padding: '32px 0', textAlign: 'center' }}>
          {query || activeCount > 0 ? 'Nothing matches those filters.' : 'No novels found.'}
        </p>
      ) : view === 'grid' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 14 }}>
          {results.map((n, i) => <GridCard key={n.novel_id} novel={n} index={i} />)}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 10 }}>
          {results.map((n, i) => <ListRow key={n.novel_id} novel={n} index={i} />)}
        </div>
      )}
    </div>
  );
}

function RadioRow({
  name,
  label,
  checked,
  onSelect,
}: {
  name: string;
  label: string;
  checked: boolean;
  onSelect: () => void;
}) {
  return (
    <label
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '5px 2px',
        fontSize: 'var(--text-sm)',
        color: checked ? 'var(--color-accent)' : 'var(--color-text)',
        fontWeight: checked ? 600 : 400,
        cursor: 'pointer',
      }}
    >
      <input type="radio" name={name} checked={checked} onChange={onSelect} />
      {label}
    </label>
  );
}

function FilterIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" focusable="false">
      <path d="M3 6h18M6 12h12M10 18h4" />
    </svg>
  );
}

function ViewButton({ mode, active, onClick }: { mode: ViewMode; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={mode === 'grid' ? 'Grid view' : 'List view'}
      aria-pressed={active}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 30, height: 26, borderRadius: 'var(--radius-sm)', border: 'none',
        background: active ? 'rgba(255,255,255,0.10)' : 'transparent',
        color: active ? 'var(--color-text)' : 'var(--color-text-faint)',
        cursor: 'pointer', touchAction: 'manipulation',
      }}
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
        {mode === 'grid' ? (
          <>
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" />
            <rect x="14" y="14" width="7" height="7" rx="1" />
          </>
        ) : (
          <>
            <path d="M8 6h13M8 12h13M8 18h13" />
            <path d="M3 6h.01M3 12h.01M3 18h.01" />
          </>
        )}
      </svg>
    </button>
  );
}

const cardBase: React.CSSProperties = {
  borderRadius: 'var(--radius-lg)',
  display: 'block',
  textDecoration: 'none',
  // No inline `transition`: it outranks the .cover-lift / .row-interactive
  // classes that own these transitions, so the token easing was being
  // discarded and `translate` never made it into the transition list.
};

function GridCard({ novel, index }: { novel: Novel; index: number }) {
  return (
    <Link
      to={`/novel/${encodeURIComponent(novel.novel_id)}`}
      className="animate-fade-in cover-lift"
      style={{ ...cardBase, animationDelay: `${Math.min(index * 18, 200)}ms` }}
    >
      <div
        className="cover-lift-art"
        style={{ width: '100%', aspectRatio: '5 / 7', borderRadius: 8, overflow: 'hidden', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--color-border)', marginBottom: 8 }}
      >
        <img
          src={coverUrl(novel.novel_id)}
          alt=""
          loading="lazy"
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />
      </div>
      <div className="text-muted tabular" style={{ fontSize: 'var(--text-xs)', display: 'flex', gap: 8, marginBottom: 3 }}>
        <span>Ch. {novel.latest_chapter ?? 0}</span>
        <span style={{ flex: 1 }} />
        {novel.latest_chapter_num != null && <span className="text-faint">/ {novel.latest_chapter_num}</span>}
      </div>
      <div className="line-clamp-2" style={{ fontWeight: 600, fontSize: 'var(--text-sm)', color: 'var(--color-text)' }}>
        {novel.title}
      </div>
    </Link>
  );
}

function ListRow({ novel, index }: { novel: Novel; index: number }) {
  return (
    <Link
      to={`/novel/${encodeURIComponent(novel.novel_id)}`}
      className="panel animate-fade-in row-interactive"
      style={{ ...cardBase, animationDelay: `${Math.min(index * 18, 200)}ms`, padding: 12 }}
    >
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <div style={{ width: 44, height: 62, flexShrink: 0, borderRadius: 6, overflow: 'hidden', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--color-border)' }}>
          <img
            src={coverUrl(novel.novel_id)}
            alt=""
            width={44}
            height={62}
            loading="lazy"
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="line-clamp-2" style={{ fontWeight: 600, fontSize: 'var(--text-sm)', color: 'var(--color-text)', marginBottom: 5 }}>
            {novel.title}
          </div>
          <ProgressBar percent={novel.latest_percent ?? 0} showLabel size="sm" />
          <div className="text-faint tabular" style={{ fontSize: 'var(--text-xs)', marginTop: 5, display: 'flex', gap: 8 }}>
            <span>Ch. {novel.latest_chapter ?? 0}{novel.latest_chapter_num ? ` / ${novel.latest_chapter_num}` : ''}</span>
            <span style={{ flex: 1 }} />
            {novel.latest_read_at && <span>{formatTimestamp(novel.latest_read_at)}</span>}
          </div>
        </div>
      </div>
    </Link>
  );
}
