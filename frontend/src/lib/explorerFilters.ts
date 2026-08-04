import type { Novel, NovelStatus } from '../types/index.js';
import { updatedAt } from './novelSort.js';

/**
 * Filters for the Explorer panel. Every field here is backed by data that is
 * actually populated — genre and author are set on 131 of 132 novels and
 * chapter counts on all of them. Tags are deliberately absent: none are
 * assigned, so the control would always be empty.
 */

/** Unset → include → exclude. Excluding is how you say "anything but harem". */
export type TriState = 'off' | 'include' | 'exclude';

export const nextTriState = (s: TriState): TriState =>
  s === 'off' ? 'include' : s === 'include' ? 'exclude' : 'off';

/** With several genres included: 'all' demands every one, 'any' just one. */
export type InclusionMode = 'all' | 'any';

export interface ExplorerFilters {
  genres: Record<string, TriState>;
  genreMode: InclusionMode;
  statuses: NovelStatus[];
  author: string;
  minChapters: string;
  updatedWithin: 'any' | '24h' | '7d' | '30d' | '90d';
  favouritesOnly: boolean;
}

export const DEFAULT_FILTERS: ExplorerFilters = {
  genres: {},
  genreMode: 'all',
  statuses: [],
  author: '',
  minChapters: '',
  updatedWithin: 'any',
  favouritesOnly: false,
};

export const UPDATED_WITHIN_OPTIONS: Array<{ id: ExplorerFilters['updatedWithin']; label: string; days: number | null }> = [
  { id: 'any', label: 'Any time', days: null },
  { id: '24h', label: 'Last 24 hours', days: 1 },
  { id: '7d', label: 'Last 7 days', days: 7 },
  { id: '30d', label: 'Last 30 days', days: 30 },
  { id: '90d', label: 'Last 90 days', days: 90 },
];

export const STATUS_OPTIONS: Array<{ id: NovelStatus; label: string }> = [
  { id: 'reading', label: 'Reading' },
  { id: 'completed', label: 'Completed' },
  { id: 'on-hold', label: 'On hold' },
  { id: 'dropped', label: 'Dropped' },
  { id: 'plan-to-read', label: 'Plan to read' },
];

/** Genre arrives as one comma-joined string per novel, e.g.
 *  "FANTASY,ACTION,ROMANCE". Split it so a novel matches any of its genres. */
export function novelGenres(n: Novel): string[] {
  if (!n.genre) return [];
  return n.genre
    .split(',')
    .map(g => g.trim())
    .filter(Boolean);
}

/** Every genre present in the library, de-duplicated and alphabetised. */
export function collectGenres(novels: Novel[]): string[] {
  const seen = new Set<string>();
  for (const n of novels) {
    for (const g of novelGenres(n)) seen.add(g);
  }
  return [...seen].sort((a, b) => a.localeCompare(b));
}

export const genresInState = (f: ExplorerFilters, state: TriState): string[] =>
  Object.entries(f.genres)
    .filter(([, s]) => s === state)
    .map(([g]) => g);

/** Summary for the genre trigger, mirroring how the control reads when shut. */
export function genreSummary(f: ExplorerFilters): string {
  const included = genresInState(f, 'include');
  const excluded = genresInState(f, 'exclude');
  const total = included.length + excluded.length;

  if (total === 0) return 'Any';
  if (total === 1) return included[0] ?? `Not ${excluded[0]}`;
  return `${included.length ? included[0] : `Not ${excluded[0]}`} +${total - 1}`;
}

/** Groups that are narrowing results — drives the Filters button badge. */
export function activeFilterCount(f: ExplorerFilters): number {
  let count = 0;
  if (genresInState(f, 'include').length || genresInState(f, 'exclude').length) count++;
  if (f.statuses.length) count++;
  if (f.author.trim()) count++;
  if (f.minChapters.trim()) count++;
  if (f.updatedWithin !== 'any') count++;
  if (f.favouritesOnly) count++;
  return count;
}

export function applyExplorerFilters(
  novels: Novel[],
  f: ExplorerFilters,
  now: Date = new Date(),
): Novel[] {
  // A non-numeric or negative entry is treated as "no minimum" rather than
  // silently emptying the page while the reader is still typing.
  const parsedMin = Number(f.minChapters);
  const minChapters =
    f.minChapters.trim() && Number.isFinite(parsedMin) && parsedMin > 0 ? parsedMin : null;

  const author = f.author.trim().toLowerCase();
  const withinDays = UPDATED_WITHIN_OPTIONS.find(o => o.id === f.updatedWithin)?.days ?? null;
  const included = genresInState(f, 'include');
  const excluded = genresInState(f, 'exclude');

  return novels.filter(n => {
    if (f.statuses.length && !f.statuses.includes(n.status)) return false;
    if (f.favouritesOnly && !n.favorite) return false;

    if (included.length || excluded.length) {
      const own = novelGenres(n);
      // Exclusion wins over inclusion: an excluded genre removes the novel even
      // if it also carries one you asked for.
      if (excluded.some(g => own.includes(g))) return false;
      if (included.length) {
        const ok = f.genreMode === 'all'
          ? included.every(g => own.includes(g))
          : included.some(g => own.includes(g));
        if (!ok) return false;
      }
    }

    if (author && !(n.author ?? '').toLowerCase().includes(author)) return false;

    if (minChapters !== null && (n.latest_chapter_num ?? 0) < minChapters) return false;

    if (withinDays !== null) {
      const stamp = updatedAt(n);
      if (!stamp) return false;
      const ageDays = (now.getTime() - new Date(stamp).getTime()) / 86_400_000;
      if (!Number.isFinite(ageDays) || ageDays > withinDays) return false;
    }

    return true;
  });
}
