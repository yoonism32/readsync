import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { SWRConfig } from 'swr';
import type { ReplayResponse } from '../types/index.js';
import { Replay } from './Replay.js';

const mocks = vi.hoisted(() => ({ replay: vi.fn() }));
vi.mock('../api/client.js', async importOriginal => ({
  ...await importOriginal<Record<string, unknown>>(),
  stats: { replay: mocks.replay },
}));

const replay: ReplayResponse = {
  month: '2026-09', timezone: 'UTC',
  period: { local_start: '2026-09-01', local_end_exclusive: '2026-10-01' },
  coverage: {
    first_recorded_at: '2026-09-01T00:00:00.000Z',
    last_recorded_at: '2026-09-10T10:00:00.000Z',
  },
  summary: { recorded_reading_days: 2, titles_visited: 1, estimated_session_seconds: 5400 },
  titles: [{
    novel_id: 'novel:one', title: 'The First Novel', recorded_days: 2, observed_chapters: 2,
    first_observed_at: '2026-09-03T10:00:00.000Z', last_observed_at: '2026-09-10T10:00:00.000Z',
  }],
  days: [{
    date: '2026-09-03', estimated_session_seconds: 5400,
    titles: [{
      novel_id: 'novel:one', title: 'The First Novel', read_through: 1,
      from_chapter: 100, to_chapter: 200, observed_chapters: 2,
      first_observed_at: '2026-09-03T10:00:00.000Z', last_observed_at: '2026-09-03T11:00:00.000Z',
    }],
  }],
  milestones: {
    started: [{ novel_id: 'novel:one', title: 'The First Novel', date: '2026-09-02' }],
    completed: [],
  },
};

function LocationProbe() {
  return <output data-testid="location">{useLocation().search}</output>;
}

function setup(url = '/replay?month=2026-09') {
  return render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/replay" element={<><Replay /><LocationProbe /></>} />
          <Route path="/novel/:novelId" element={<h1>Novel detail</h1>} />
        </Routes>
      </MemoryRouter>
    </SWRConfig>,
  );
}

beforeEach(() => mocks.replay.mockResolvedValue(replay));
afterEach(cleanup);

describe('Monthly Reading Replay', () => {
  it('renders recorded facts and observed ranges without completion claims', async () => {
    setup();
    expect(await screen.findByRole('heading', { name: 'September 2026' })).toBeDefined();
    const summary = within(screen.getByRole('region', { name: 'Month summary' }));
    expect(summary.getByText('2 recorded days')).toBeDefined();
    expect(summary.getByText('1 title visited')).toBeDefined();
    expect(summary.getByText('1h 30m estimated')).toBeDefined();
    expect(screen.getByRole('link', { name: 'The First Novel' }).getAttribute('href'))
      .toBe('/novel/novel%3Aone');
    expect(screen.getByText('Observed Ch. 100–200')).toBeDefined();
    expect(screen.getByText(/offline activity may appear on the date it was uploaded/i)).toBeDefined();
    expect(document.body.textContent).not.toMatch(/chapters completed/i);
  });

  it('stores the selected month in the URL and requests only that month', async () => {
    setup('/replay?month=2026-09&other=keep');
    await screen.findByRole('region', { name: 'Month summary' });
    const month = screen.getByLabelText('Replay month');
    fireEvent.change(month, { target: { value: '2026-08' } });
    await waitFor(() => expect(screen.getByTestId('location').textContent)
      .toContain('month=2026-08'));
    expect(screen.getByTestId('location').textContent).toContain('other=keep');
    await waitFor(() => expect(mocks.replay.mock.calls.some(([value]) => value === '2026-08')).toBe(true));
  });

  it('shows recorded milestones when the month has no reading events', async () => {
    mocks.replay.mockResolvedValueOnce({
      ...replay,
      coverage: { first_recorded_at: null, last_recorded_at: null },
      summary: { recorded_reading_days: 0, titles_visited: 0, estimated_session_seconds: 0 },
      titles: [],
      days: [],
      milestones: {
        started: [{ novel_id: 'novel:one', title: 'The First Novel', date: '2026-09-02' }],
        completed: [],
      },
    });

    setup();
    expect(await screen.findByText('Started')).toBeDefined();
    expect(screen.getByText(/The First Novel · 2026-09-02/)).toBeDefined();
    expect(screen.queryByText(/No recorded activity for this month/i)).toBeNull();
  });

  it('distinguishes empty months from failed requests and supports retry', async () => {
    mocks.replay.mockResolvedValueOnce({
      ...replay,
      summary: { recorded_reading_days: 0, titles_visited: 0, estimated_session_seconds: 0 },
      titles: [], days: [], milestones: { started: [], completed: [] },
    });
    const view = setup();
    expect(await screen.findByText(/No recorded activity for this month/i)).toBeDefined();
    expect(screen.getByText(/does not necessarily mean no reading happened/i)).toBeDefined();
    view.unmount();

    mocks.replay.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(replay);
    setup();
    const retry = await screen.findByRole('button', { name: 'Try again' });
    expect(screen.getByRole('alert')).toBeDefined();
    await userEvent.setup().click(retry);
    const summary = await screen.findByRole('region', { name: 'Month summary' });
    expect(within(summary).getByText('2 recorded days')).toBeDefined();
  });
});
