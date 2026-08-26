import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { SWRConfig } from 'swr';
import type { Novel } from '../types/index.js';
import { NovelPage } from './Novel.js';

const mocks = vi.hoisted(() => ({
  fetchNovels: vi.fn(),
  synopsis: vi.fn().mockResolvedValue({ synopsis: null, synopsis_imported_at: null, primary_url: null }),
}));

vi.mock('../api/client.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  const actualNovels = actual.novels as Record<string, unknown>;
  return {
    ...actual,
    fetchNovels: mocks.fetchNovels,
    novels: { ...actualNovels, synopsis: mocks.synopsis },
  };
});

const NOVEL_ID = 'novelbin:nine-star-hegemon-body-arts';

function novel(overrides: Partial<Novel> = {}): Novel {
  return {
    novel_id: NOVEL_ID,
    title: 'Nine Star Hegemon Body Arts',
    primary_url: 'https://novelarrow.com/novel/nine-star-hegemon-body-arts',
    author: null,
    genre: null,
    status: 'reading',
    favorite: false,
    rating: 0,
    notes: null,
    latest_chapter_num: 7150,
    latest_chapter_title: null,
    chapters_updated_at: null,
    site_latest_chapter_time: null,
    site_latest_chapter_time_raw: null,
    last_activity: null,
    started_at: null,
    completed_at: null,
    current_read_through: 1,
    read_history: [],
    latest_chapter: 2,
    latest_percent: 97.8,
    latest_url: 'https://novelarrow.com/novel/nine-star-hegemon-body-arts/chapter-2',
    latest_device_id: 'd1',
    latest_device_label: 'Desktop-Chrome',
    latest_read_at: null,
    devices_reading: [],
    ...overrides,
  };
}

function renderNovel() {
  return render(
    <SWRConfig value={{ provider: () => new Map() }}>
      <MemoryRouter initialEntries={[`/novel/${encodeURIComponent(NOVEL_ID)}`]}>
        <Routes>
          <Route path="/novel/:novelId" element={<NovelPage />} />
        </Routes>
      </MemoryRouter>
    </SWRConfig>,
  );
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve([]),
  }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('novel page actions', () => {
  it('offers "Open on NovelArrow" alongside Continue Reading', async () => {
    // The bug this guards: the port made these two mutually exclusive, so any
    // novel with reading progress lost its link to the source site entirely.
    mocks.fetchNovels.mockResolvedValue([novel()]);

    renderNovel();

    const open = await screen.findByRole('link', { name: /open on novelarrow/i });
    expect(open).toHaveProperty('href', 'https://novelarrow.com/novel/nine-star-hegemon-body-arts');
    expect(open.getAttribute('target')).toBe('_blank');
    expect(open.getAttribute('rel')).toMatch(/noopener/);

    // The primary CTA is still there and still resumes at the saved position.
    const resume = screen.getByRole('link', { name: /continue reading/i });
    expect(resume.getAttribute('href')).toContain('chapter-2');
  });

  it('links to the novel index, not the chapter the reader left off on', async () => {
    mocks.fetchNovels.mockResolvedValue([novel()]);

    renderNovel();

    const open = await screen.findByRole('link', { name: /open on novelarrow/i });
    expect(open.getAttribute('href')).not.toContain('chapter-2');
    expect(open.getAttribute('href')).not.toContain('#nbp=');
  });

  it('does not double up when there is no progress yet', async () => {
    // With no latest_url the primary button already opens NovelArrow, so a
    // second copy would be redundant.
    mocks.fetchNovels.mockResolvedValue([novel({ latest_url: null, latest_chapter: null, latest_percent: null })]);

    renderNovel();

    expect(await screen.findByRole('link', { name: /open on novelarrow/i })).toBeDefined();
    expect(screen.queryAllByRole('link', { name: /open on novelarrow/i })).toHaveLength(1);
  });
});

describe('synopsis panel', () => {
  it('renders the stored synopsis and a link to the NovelArrow source', async () => {
    mocks.fetchNovels.mockResolvedValue([novel()]);
    mocks.synopsis.mockResolvedValue({
      synopsis: 'A hero rises from poverty to face the Nightmare Spell.',
      synopsis_imported_at: '2026-08-01T00:00:00.000Z',
      primary_url: 'https://novelarrow.com/novel/nine-star-hegemon-body-arts',
    });

    renderNovel();

    expect(await screen.findByText(/a hero rises from poverty/i)).toBeDefined();
    const link = screen.getByRole('link', { name: /view on novelarrow/i });
    expect(link).toHaveProperty('href', 'https://novelarrow.com/novel/nine-star-hegemon-body-arts');
  });

  it('renders stored paragraph separators as compact semantic paragraphs', async () => {
    mocks.fetchNovels.mockResolvedValue([novel()]);
    mocks.synopsis.mockResolvedValue({
      synopsis: 'First paragraph.\n\nSecond paragraph.\n\nThird paragraph.',
      synopsis_imported_at: '2026-08-01T00:00:00.000Z',
      primary_url: null,
    });

    renderNovel();

    const copy = await screen.findByTestId('synopsis-copy');
    const paragraphs = copy.querySelectorAll('p');
    expect(paragraphs).toHaveLength(3);
    expect(Array.from(paragraphs, paragraph => paragraph.textContent)).toEqual([
      'First paragraph.',
      'Second paragraph.',
      'Third paragraph.',
    ]);
    expect(copy.style.gap).toBe('6px');
    expect(copy.style.maxWidth).toBe('');
  });

  it('shows an empty state when no synopsis is stored yet', async () => {
    mocks.fetchNovels.mockResolvedValue([novel()]);
    mocks.synopsis.mockResolvedValue({ synopsis: null, synopsis_imported_at: null, primary_url: null });

    renderNovel();

    expect(await screen.findByText(/no synopsis stored yet/i)).toBeDefined();
  });
});
