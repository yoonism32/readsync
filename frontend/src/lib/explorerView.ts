import { DEFAULT_FILTERS, STATUS_OPTIONS, UPDATED_WITHIN_OPTIONS } from './explorerFilters.js';
import type { ExplorerFilters } from './explorerFilters.js';
import { DEFAULT_SORT_ID, SORT_OPTIONS } from './novelSort.js';

export interface ExplorerView {
  query: string;
  filters: ExplorerFilters;
  sortId: string;
  view: 'grid' | 'list';
}

const OWNED_PARAMS = ['q', 'genre', 'excludeGenre', 'genreMode', 'status', 'author',
  'minChapters', 'updatedWithin', 'favourites', 'sort', 'view'];

function chapterMinimum(value: string): string {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? String(number) : '';
}

export function parseExplorerView(params: URLSearchParams): ExplorerView {
  const genres = (key: string, state: 'include' | 'exclude') => params.getAll(key)
    .map(value => value.trim()).filter(Boolean).map(value => [value, state]);
  return {
    query: params.get('q') ?? '',
    filters: {
      ...DEFAULT_FILTERS,
      // Exclusion wins; fromEntries also treats __proto__ as an ordinary genre.
      genres: Object.fromEntries([...genres('genre', 'include'), ...genres('excludeGenre', 'exclude')]),
      genreMode: params.get('genreMode') === 'any' ? 'any' : 'all',
      statuses: STATUS_OPTIONS.filter(option => params.getAll('status').includes(option.id)).map(option => option.id),
      author: params.get('author') ?? '',
      minChapters: chapterMinimum(params.get('minChapters') ?? ''),
      updatedWithin: UPDATED_WITHIN_OPTIONS.find(option => option.id === params.get('updatedWithin'))?.id ?? 'any',
      favouritesOnly: params.get('favourites') === '1',
    },
    sortId: SORT_OPTIONS.find(option => option.id === params.get('sort'))?.id ?? DEFAULT_SORT_ID,
    view: params.get('view') === 'list' ? 'list' : 'grid',
  };
}

/** Stable bookmark format; only Explorer's own keys are replaced. */
export function serializeExplorerView(state: ExplorerView, base = new URLSearchParams()): URLSearchParams {
  const params = new URLSearchParams(base);
  for (const key of OWNED_PARAMS) params.delete(key);
  const { filters } = state;
  if (state.query) params.set('q', state.query);
  for (const genre of Object.keys(filters.genres).sort()) {
    if (filters.genres[genre] === 'include') params.append('genre', genre);
    if (filters.genres[genre] === 'exclude') params.append('excludeGenre', genre);
  }
  if (filters.genreMode === 'any') params.set('genreMode', 'any');
  for (const option of STATUS_OPTIONS) {
    if (filters.statuses.includes(option.id)) params.append('status', option.id);
  }
  if (filters.author) params.set('author', filters.author);
  const minimum = chapterMinimum(filters.minChapters);
  if (minimum) params.set('minChapters', minimum);
  if (filters.updatedWithin !== 'any') params.set('updatedWithin', filters.updatedWithin);
  if (filters.favouritesOnly) params.set('favourites', '1');
  if (state.sortId !== DEFAULT_SORT_ID) params.set('sort', state.sortId);
  if (state.view === 'list') params.set('view', 'list');
  return params;
}
