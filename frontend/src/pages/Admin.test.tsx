import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Admin } from './Admin.js';

const mocks = vi.hoisted(() => ({
  probeNovelArrow: vi.fn(),
}));

vi.mock('../api/client.js', () => ({
  admin: { probeNovelArrow: mocks.probeNovelArrow },
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('Admin NovelArrow Render probe', () => {
  it('runs the probe and renders Render-side results', async () => {
    mocks.probeNovelArrow.mockResolvedValue({
      summary: '1/1 responses usable',
      tested_at: '2026-08-21T16:00:00.000Z',
      batch_size: 3,
      batch_delay_ms: 5000,
      results: [
        {
          slug: 'unparalleled-after-ten-consecutive-draws',
          url: 'https://novelarrow.com/novel/unparalleled-after-ten-consecutive-draws',
          status: 200,
          elapsed_ms: 415,
          latest_chapter: 'Chapter 2511 Infiniverse To One, Eternal World',
          cf_ray: 'test-ray-LHR',
          challenged: false,
          ok: true,
          error: null,
        },
      ],
    });

    render(<Admin />);
    fireEvent.click(screen.getByRole('button', { name: 'Run Render Probe' }));

    await waitFor(() => expect(mocks.probeNovelArrow).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('1/1 responses usable')).toBeDefined();
    expect(screen.getByText('Chapter 2511 Infiniverse To One, Eternal World')).toBeDefined();
    expect(screen.getByText('Usable')).toBeDefined();
  });

  it('shows a failed request without leaving the control disabled', async () => {
    mocks.probeNovelArrow.mockRejectedValue(new Error('409 Conflict'));

    render(<Admin />);
    const button = screen.getByRole('button', { name: 'Run Render Probe' });
    fireEvent.click(button);

    expect((await screen.findByRole('alert')).textContent).toContain('409 Conflict');
    await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));
  });
});
