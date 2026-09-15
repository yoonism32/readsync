import { describe, expect, it } from 'vitest';
import { DEFAULT_FILTERS } from './explorerFilters.js';
import { DEFAULT_SORT_ID } from './novelSort.js';
import { parseExplorerView, serializeExplorerView } from './explorerView.js';

describe('Explorer URL contract', () => {
  it('round-trips every control and preserves unrelated parameters', () => {
    const view = {
      query: 'dragon & moon',
      filters: {
        ...DEFAULT_FILTERS,
        genres: { 'ACTION & ADVENTURE': 'include' as const, HAREM: 'exclude' as const },
        genreMode: 'any' as const,
        statuses: ['reading' as const, 'on-hold' as const],
        author: 'A + B', minChapters: '100', updatedWithin: '7d' as const,
        favouritesOnly: true,
      },
      sortId: 'title_asc', view: 'list' as const,
    };
    const params = serializeExplorerView(view, new URLSearchParams('other=one&other=two&q=old'));
    expect(parseExplorerView(params)).toEqual(view);
    expect(params.getAll('other')).toEqual(['one', 'two']);
    expect(serializeExplorerView(parseExplorerView(params), params).toString()).toBe(params.toString());
  });

  it('uses clean defaults and ignores malformed or obsolete choices', () => {
    const params = new URLSearchParams('status=removed&status=unknown&genreMode=none&view=table&sort=nope&minChapters=Infinity&updatedWithin=yesterday&favourites=true');
    const view = parseExplorerView(params);
    expect(view).toEqual({ query: '', filters: DEFAULT_FILTERS, sortId: DEFAULT_SORT_ID, view: 'grid' });
    expect(serializeExplorerView(view, params).toString()).toBe('');
    for (const bad of ['-1', '0', '1.2', '9007199254740992', 'abc']) {
      expect(parseExplorerView(new URLSearchParams({ minChapters: bad })).filters.minChapters).toBe('');
    }
  });

  it('deduplicates repeated choices, lets exclusion win and retains unseen genres safely', () => {
    const params = new URLSearchParams('genre=FANTASY&genre=FANTASY&genre=%20&genre=NEW&genre=__proto__&excludeGenre=FANTASY&status=reading&status=reading&status=removed');
    const view = parseExplorerView(params);
    expect(Object.entries(view.filters.genres)).toEqual([
      ['FANTASY', 'exclude'], ['NEW', 'include'], ['__proto__', 'include'],
    ]);
    expect(view.filters.statuses).toEqual(['reading']);
    expect(serializeExplorerView(view).getAll('genre')).toEqual(['NEW', '__proto__']);
    expect(parseExplorerView(new URLSearchParams('q=%E0%A4%A'))).toBeDefined();
  });
});
