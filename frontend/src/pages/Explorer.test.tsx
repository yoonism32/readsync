import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { useEffect } from 'react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { SWRConfig, useSWRConfig } from 'swr';
import type { Novel } from '../types/index.js';
import { Explorer } from './Explorer.js';

const mocks = vi.hoisted(() => ({ fetchNovels: vi.fn() }));
vi.mock('../api/client.js', async importOriginal => ({
  ...await importOriginal<Record<string, unknown>>(), fetchNovels: mocks.fetchNovels,
}));

function novel(title: string, overrides: Partial<Novel> = {}): Novel {
  return {
    novel_id: title, title, primary_url: null, author: 'Ada', genre: 'FANTASY',
    status: 'reading', favorite: true, rating: 0, notes: null,
    latest_chapter_num: 200, latest_chapter_title: null, chapters_updated_at: null,
    site_latest_chapter_time: new Date().toISOString(), site_latest_chapter_time_raw: null,
    last_activity: null, started_at: null, completed_at: null, created_at: null, current_read_through: 1,
    read_history: [], latest_chapter: 20, latest_percent: 50, latest_url: null,
    latest_device_id: null, latest_device_label: null, latest_read_at: null, devices_reading: [],
    ...overrides,
  };
}

const library = [novel('Dragon Z'), novel('Dragon A'), novel('Other', { genre: 'HAREM', favorite: false })];
const searchBox = () => screen.getByRole('searchbox');
const cardTitles = () => screen.queryAllByRole('link')
  .map(link => link.getAttribute('href'))
  .filter(href => href?.startsWith('/novel/'));

function setup(url = '/explorer') {
  const router = createMemoryRouter([
    { path: '/explorer', element: <Explorer /> },
    { path: '/novel/:novelId', element: <h1>Novel detail</h1> },
  ], { initialEntries: [url] });
  const cache = { update: undefined as ((novels: Novel[]) => Promise<unknown>) | undefined };
  function CacheAccess({ onReady }: { onReady: (mutate: typeof cache.update) => void }) {
    const { mutate } = useSWRConfig();
    useEffect(() => onReady(novels => mutate('/novels', novels, false)), [mutate, onReady]);
    return null;
  }
  const onReady = (mutate: typeof cache.update) => { cache.update = mutate; };
  render(<SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
    <CacheAccess onReady={onReady} /><RouterProvider router={router} />
  </SWRConfig>);
  return {
    router, user: userEvent.setup(),
    search: () => router.state.location.search,
    back: () => act(() => router.navigate(-1)),
    forward: () => act(() => router.navigate(1)),
    updateLibrary: (novels: Novel[]) => act(async () => { await cache.update?.(novels); }),
  };
}

beforeEach(() => { mocks.fetchNovels.mockResolvedValue(library); });
afterEach(cleanup);

describe('URL-preserved Explorer views', () => {
  it('restores every control, ordering and layout from a bookmarked URL and remount', async () => {
    const url = '/explorer?q=Dragon&genre=FANTASY&excludeGenre=HAREM&genreMode=any&status=reading&author=Ada&minChapters=100&updatedWithin=7d&favourites=1&sort=title_asc&view=list';
    const first = setup(url);
    await waitFor(() => expect(cardTitles()).toEqual(['/novel/Dragon%20A', '/novel/Dragon%20Z']));
    expect(searchBox()).toHaveProperty('value', 'Dragon');
    expect(screen.getByRole('button', { name: 'List view' }).getAttribute('aria-pressed')).toBe('true');
    await first.user.click(screen.getByRole('button', { name: /Filters/ }));
    expect(screen.getByLabelText('Author')).toHaveProperty('value', 'Ada');
    expect(screen.getByLabelText('Minimum chapters')).toHaveProperty('value', '100');
    expect(screen.getByRole('button', { name: 'Match any' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Reading' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByLabelText('Favourites only')).toHaveProperty('checked', true);
    expect(screen.getByRole('button', { name: /FANTASY.*included/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /HAREM.*excluded/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /Last 7 days/ })).toBeDefined();
    cleanup();
    const second = setup(url);
    await waitFor(() => expect(cardTitles()).toEqual(['/novel/Dragon%20A', '/novel/Dragon%20Z']));
    expect(second.search()).toBe(url.slice('/explorer'.length));
    expect(searchBox()).toHaveProperty('value', 'Dragon');
  });

  it('groups typing while preserving discrete choices, Back/Forward and detail return', async () => {
    const app = setup();
    await screen.findByText('Dragon A');
    await app.user.type(searchBox(), 'Dragon');
    expect(app.search()).toBe('?q=Dragon');
    await app.user.click(screen.getByRole('button', { name: 'List view' }));
    expect(app.search()).toBe('?q=Dragon&view=list');
    await app.back();
    expect(searchBox()).toHaveProperty('value', 'Dragon');
    expect(screen.getByRole('button', { name: 'Grid view' }).getAttribute('aria-pressed')).toBe('true');
    await app.back();
    expect(app.search()).toBe('');
    expect(searchBox()).toHaveProperty('value', '');
    await app.forward();
    expect(searchBox()).toHaveProperty('value', 'Dragon');
    const saved = app.search();
    await app.user.click(screen.getByRole('link', { name: /Dragon A/ }));
    expect(screen.getByRole('heading', { name: 'Novel detail' })).toBeDefined();
    await app.back();
    expect(app.search()).toBe(saved);
    await waitFor(() => expect(cardTitles()).toHaveLength(2));
  });

  it('groups author and chapter edits and starts a new edit after Back while still focused', async () => {
    const app = setup();
    await screen.findByText('Dragon A');
    await app.user.click(screen.getByRole('button', { name: /Filters/ }));
    await app.user.type(screen.getByLabelText('Author'), 'Ada');
    await app.user.type(screen.getByLabelText('Minimum chapters'), '100');
    expect(app.search()).toBe('?author=Ada&minChapters=100');
    await app.back();
    expect(app.search()).toBe('?author=Ada');
    await app.user.type(screen.getByLabelText('Minimum chapters'), '50');
    expect(app.search()).toBe('?author=Ada&minChapters=50');
    await app.back();
    expect(app.search()).toBe('?author=Ada');
    await app.back();
    expect(app.search()).toBe('');
  });

  it('resets filters and sort atomically, retaining search, layout and unrelated params', async () => {
    const original = '?other=keep&q=Dragon&genre=FANTASY&status=reading&sort=title_asc&view=list';
    const app = setup('/explorer' + original);
    await screen.findByText('Dragon A');
    await app.user.click(screen.getByRole('button', { name: /Filters/ }));
    await app.user.click(screen.getByRole('button', { name: 'Reset filters' }));
    expect(app.search()).toBe('?other=keep&q=Dragon&view=list');
    await app.back();
    expect(app.search()).toBe(original);
    expect(screen.getByRole('button', { name: 'Reading' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: /FANTASY.*included/i })).toBeDefined();
  });

  it('clears an empty search and filters in one navigation, retaining sort and layout', async () => {
    const original = '?other=keep&q=missing&status=completed&sort=title_asc&view=list';
    const app = setup('/explorer' + original);
    await app.user.click(await screen.findByRole('button', { name: 'Clear search and filters' }));
    expect(app.search()).toBe('?other=keep&sort=title_asc&view=list');
    await waitFor(() => expect(cardTitles()).toHaveLength(3));
    await app.back();
    expect(app.search()).toBe(original);
    expect(await screen.findByText('Nothing matches those filters.')).toBeDefined();
  });

  it('keeps an unseen genre editable and recomputes a saved view after a cache update', async () => {
    const app = setup('/explorer?genre=NEW&status=reading&sort=title_asc');
    await screen.findByText('Nothing matches those filters.');
    await app.user.click(screen.getByRole('button', { name: /Filters/ }));
    expect(screen.getByRole('button', { name: /NEW.*included/i })).toBeDefined();
    const original = app.search();
    await app.updateLibrary([...library, novel('New arrival', { genre: 'NEW' })]);
    expect(await screen.findByText('New arrival')).toBeDefined();
    expect(app.search()).toBe(original);
    await app.updateLibrary(library);
    expect(await screen.findByText('Nothing matches those filters.')).toBeDefined();
  });

  it('falls back safely from obsolete parameters and canonicalizes on the next choice', async () => {
    const app = setup('/explorer?genreMode=wrong&status=removed&minChapters=NaN&view=table&sort=old&other=keep');
    await waitFor(() => expect(cardTitles()).toHaveLength(3));
    expect(screen.getByRole('button', { name: 'Grid view' }).getAttribute('aria-pressed')).toBe('true');
    await app.user.click(screen.getByRole('button', { name: 'List view' }));
    expect(app.search()).toBe('?other=keep&view=list');
  });
});

describe('Explorer list view cards', () => {
  it("shows the novel's status on the list card", async () => {
    mocks.fetchNovels.mockResolvedValue([novel('StatusCard', { status: 'on-hold' })]);
    setup('/explorer?view=list');
    await screen.findByText('StatusCard');
    expect(screen.getByText('On Hold')).toBeDefined();
  });

  it('does not render a 0% progress bar when latest_percent is missing', async () => {
    mocks.fetchNovels.mockResolvedValue([novel('NoProgress', { latest_percent: null })]);
    setup('/explorer?view=list');
    await screen.findByText('NoProgress');
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(screen.getByText('Not started')).toBeDefined();
  });

  it('never nests an interactive element inside another on a list card', async () => {
    mocks.fetchNovels.mockResolvedValue([novel('SingleCard')]);
    setup('/explorer?view=list');
    await screen.findByText('SingleCard');
    expect(document.querySelector('a a, a button, button a')).toBeNull();
  });
});
