import type { Novel } from '../types/index.js';

/**
 * Sorting shared by MyList and Explorer. Both pages must agree on what
 * "progress" means, so the comparison lives here rather than being written
 * twice — progress is the chapter you have reached, not the percentage, which
 * is why a 233/233 novel and a 233/7000 novel sort level with each other.
 */
export type SortKey = 'last_read' | 'title' | 'progress' | 'updated' | 'added' | 'chapters' | 'percent';

/** Sites report a chapter's publish time; fall back to when we scraped it. */
export const updatedAt = (n: Novel): string | null =>
  n.site_latest_chapter_time ?? n.chapters_updated_at;

export function sortValue(n: Novel, key: SortKey): number | string {
  switch (key) {
    case 'title':     return n.title.toLowerCase();
    case 'progress':  return n.latest_chapter ?? -1;
    case 'percent':   return n.latest_percent ?? -1;
    case 'chapters':  return n.latest_chapter_num ?? -1;
    case 'last_read': return n.latest_read_at ? new Date(n.latest_read_at).getTime() : 0;
    case 'updated':   { const u = updatedAt(n); return u ? new Date(u).getTime() : 0; }
    case 'added':     return n.started_at ? new Date(n.started_at).getTime() : 0;
  }
}

export interface SortOption {
  id: string;
  label: string;
  key: SortKey;
  asc: boolean;
}

/** Flat list so the dropdown reads as plain choices rather than a field plus a
 *  direction toggle the reader has to reason about. */
export const SORT_OPTIONS: SortOption[] = [
  { id: 'last_read_desc', label: 'Last read — newest',      key: 'last_read', asc: false },
  { id: 'last_read_asc',  label: 'Last read — oldest',      key: 'last_read', asc: true  },
  { id: 'updated_desc',   label: 'Site update — newest',    key: 'updated',   asc: false },
  { id: 'updated_asc',    label: 'Site update — oldest',    key: 'updated',   asc: true  },
  { id: 'progress_desc',  label: 'Progress — furthest',     key: 'progress',  asc: false },
  { id: 'progress_asc',   label: 'Progress — least',        key: 'progress',  asc: true  },
  { id: 'percent_desc',   label: 'Completion — highest %',  key: 'percent',   asc: false },
  { id: 'percent_asc',    label: 'Completion — lowest %',   key: 'percent',   asc: true  },
  { id: 'chapters_desc',  label: 'Chapters — most',         key: 'chapters',  asc: false },
  { id: 'chapters_asc',   label: 'Chapters — fewest',       key: 'chapters',  asc: true  },
  { id: 'title_asc',      label: 'Title — A to Z',          key: 'title',     asc: true  },
  { id: 'title_desc',     label: 'Title — Z to A',          key: 'title',     asc: false },
  { id: 'added_desc',     label: 'Added — newest',          key: 'added',     asc: false },
  { id: 'added_asc',      label: 'Added — oldest',          key: 'added',     asc: true  },
];

export const DEFAULT_SORT_ID = 'last_read_desc';

export function sortNovels(list: Novel[], sortId: string): Novel[] {
  const option = SORT_OPTIONS.find(o => o.id === sortId) ?? SORT_OPTIONS[0];
  const dir = option.asc ? 1 : -1;

  return [...list].sort((a, b) => {
    const va = sortValue(a, option.key);
    const vb = sortValue(b, option.key);
    if (va < vb) return -1 * dir;
    if (va > vb) return 1 * dir;
    return 0;
  });
}
