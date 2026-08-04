import { describe, it, expect } from 'vitest';
import type { Novel } from '../types/index.js';
import {
  DEFAULT_FILTERS,
  activeFilterCount,
  applyExplorerFilters,
  collectGenres,
  novelGenres,
} from './explorerFilters.js';
import { SORT_OPTIONS, sortNovels, sortValue } from './novelSort.js';

const NOW = new Date('2026-08-04T12:00:00Z');

function novel(overrides: Partial<Novel> = {}): Novel {
  return {
    novel_id: overrides.title ?? 'n',
    title: 'Untitled',
    primary_url: null,
    author: null,
    genre: null,
    status: 'reading',
    favorite: false,
    rating: 0,
    notes: null,
    latest_chapter_num: 100,
    latest_chapter_title: null,
    chapters_updated_at: null,
    site_latest_chapter_time: null,
    site_latest_chapter_time_raw: null,
    last_activity: null,
    started_at: null,
    completed_at: null,
    current_read_through: 1,
    read_history: [],
    latest_chapter: 1,
    latest_percent: 0,
    latest_url: null,
    latest_device_id: null,
    latest_device_label: null,
    latest_read_at: null,
    devices_reading: [],
    ...overrides,
  };
}

describe('genre parsing', () => {
  it('splits the comma-joined genre string the API returns', () => {
    expect(novelGenres(novel({ genre: 'FANTASY,ACTION, SLICE OF LIFE' })))
      .toEqual(['FANTASY', 'ACTION', 'SLICE OF LIFE']);
  });

  it('treats a missing genre as no genres rather than one empty one', () => {
    expect(novelGenres(novel({ genre: null }))).toEqual([]);
    expect(novelGenres(novel({ genre: '' }))).toEqual([]);
  });

  it('collects a de-duplicated, sorted genre list across the library', () => {
    expect(collectGenres([
      novel({ genre: 'FANTASY,ACTION' }),
      novel({ genre: 'ACTION,ROMANCE' }),
      novel({ genre: null }),
    ])).toEqual(['ACTION', 'FANTASY', 'ROMANCE']);
  });
});

describe('minimum chapters', () => {
  const library = [
    novel({ title: 'short', latest_chapter_num: 71 }),
    novel({ title: 'long', latest_chapter_num: 7665 }),
  ];

  it('keeps only novels at or above the threshold', () => {
    const out = applyExplorerFilters(library, { ...DEFAULT_FILTERS, minChapters: '1000' }, NOW);
    expect(out.map(n => n.title)).toEqual(['long']);
  });

  it('is inclusive of the threshold itself', () => {
    const out = applyExplorerFilters(library, { ...DEFAULT_FILTERS, minChapters: '71' }, NOW);
    expect(out).toHaveLength(2);
  });

  it('ignores a half-typed or nonsense value instead of emptying the page', () => {
    for (const raw of ['', '   ', 'abc', '-5', '0']) {
      const out = applyExplorerFilters(library, { ...DEFAULT_FILTERS, minChapters: raw }, NOW);
      expect(out, `minChapters=${JSON.stringify(raw)}`).toHaveLength(2);
    }
  });

  it('treats an unknown chapter count as zero rather than matching every threshold', () => {
    const out = applyExplorerFilters(
      [novel({ title: 'unknown', latest_chapter_num: null })],
      { ...DEFAULT_FILTERS, minChapters: '10' },
      NOW,
    );
    expect(out).toHaveLength(0);
  });
});

describe('other filters', () => {
  it('matches an author substring, case-insensitively', () => {
    const library = [novel({ title: 'a', author: 'Peace_in_Chaos' }), novel({ title: 'b', author: 'Someone' })];
    const out = applyExplorerFilters(library, { ...DEFAULT_FILTERS, author: 'peace' }, NOW);
    expect(out.map(n => n.title)).toEqual(['a']);
  });

  it('matches any one of a novel\'s genres', () => {
    const library = [novel({ title: 'a', genre: 'FANTASY,HAREM' }), novel({ title: 'b', genre: 'ROMANCE' })];
    const out = applyExplorerFilters(library, { ...DEFAULT_FILTERS, genre: 'HAREM' }, NOW);
    expect(out.map(n => n.title)).toEqual(['a']);
  });

  it('filters on how recently the site published a chapter', () => {
    const library = [
      novel({ title: 'fresh', site_latest_chapter_time: '2026-08-04T06:00:00Z' }),
      novel({ title: 'old', site_latest_chapter_time: '2026-01-01T00:00:00Z' }),
      novel({ title: 'never', site_latest_chapter_time: null }),
    ];
    const out = applyExplorerFilters(library, { ...DEFAULT_FILTERS, updatedWithin: '24h' }, NOW);
    expect(out.map(n => n.title)).toEqual(['fresh']);
  });

  it('combines filters conjunctively', () => {
    const library = [
      novel({ title: 'both', genre: 'FANTASY', latest_chapter_num: 2000 }),
      novel({ title: 'genre only', genre: 'FANTASY', latest_chapter_num: 100 }),
      novel({ title: 'length only', genre: 'ROMANCE', latest_chapter_num: 2000 }),
    ];
    const out = applyExplorerFilters(library, { ...DEFAULT_FILTERS, genre: 'FANTASY', minChapters: '1000' }, NOW);
    expect(out.map(n => n.title)).toEqual(['both']);
  });

  it('counts only the filters that are actually narrowing', () => {
    expect(activeFilterCount(DEFAULT_FILTERS)).toBe(0);
    expect(activeFilterCount({ ...DEFAULT_FILTERS, author: '  ' })).toBe(0);
    expect(activeFilterCount({ ...DEFAULT_FILTERS, genre: 'FANTASY', minChapters: '10', favouritesOnly: true })).toBe(3);
  });
});

describe('sorting', () => {
  it('ranks progress by chapter reached, matching MyList', () => {
    // The shared rule: a 233/233 novel and a 233/7000 novel sort level,
    // because progress is the chapter you got to, not the percentage.
    expect(sortValue(novel({ latest_chapter: 233, latest_percent: 100 }), 'progress'))
      .toBe(sortValue(novel({ latest_chapter: 233, latest_percent: 3 }), 'progress'));
  });

  it('orders furthest-first and least-first as mirror images', () => {
    const library = [
      novel({ title: 'a', latest_chapter: 5 }),
      novel({ title: 'b', latest_chapter: 200 }),
      novel({ title: 'c', latest_chapter: 50 }),
    ];
    expect(sortNovels(library, 'progress_desc').map(n => n.title)).toEqual(['b', 'c', 'a']);
    expect(sortNovels(library, 'progress_asc').map(n => n.title)).toEqual(['a', 'c', 'b']);
  });

  it('sorts unread novels below started ones rather than above', () => {
    const library = [novel({ title: 'unread', latest_chapter: null }), novel({ title: 'read', latest_chapter: 1 })];
    expect(sortNovels(library, 'progress_desc').map(n => n.title)).toEqual(['read', 'unread']);
  });

  it('sorts titles alphabetically regardless of case', () => {
    const library = [novel({ title: 'banana' }), novel({ title: 'Apple' }), novel({ title: 'cherry' })];
    expect(sortNovels(library, 'title_asc').map(n => n.title)).toEqual(['Apple', 'banana', 'cherry']);
  });

  it('never drops or duplicates a novel', () => {
    const library = [novel({ title: 'a' }), novel({ title: 'b' }), novel({ title: 'c' })];
    for (const option of SORT_OPTIONS) {
      expect(sortNovels(library, option.id), option.id).toHaveLength(3);
    }
  });

  it('does not mutate the array it is given', () => {
    const library = [novel({ title: 'z' }), novel({ title: 'a' })];
    sortNovels(library, 'title_asc');
    expect(library.map(n => n.title)).toEqual(['z', 'a']);
  });

  it('falls back to the default order for an unknown sort id', () => {
    const library = [novel({ title: 'a' }), novel({ title: 'b' })];
    expect(sortNovels(library, 'nonsense')).toHaveLength(2);
  });
});
