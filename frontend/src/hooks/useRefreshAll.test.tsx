/**
 * Regression tests for Refresh All failure reporting.
 *
 * The userscript already classifies every failure it hits and forwards a
 * `reason` over postMessage, but the hook used to collapse each result to a
 * boolean — so a run reported "Refreshed 131, 1 failed" with no way to learn
 * which novel failed or why short of reading server logs.
 */
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useRefreshAll } from './useRefreshAll.js';
import type { Novel } from '../types/index.js';

vi.mock('../api/client.js', () => ({
  settings: {
    getLastRefresh: vi.fn().mockResolvedValue({ last_refresh: null }),
    getPrefs: vi
      .fn()
      .mockResolvedValue({ refresh_interval_hours: 24, notifications_enabled: false }),
    setLastRefresh: vi.fn().mockResolvedValue({}),
  },
}));

const novel = (id: string, title: string): Novel =>
  ({
    novel_id: id,
    title,
    primary_url: `https://novelarrow.com/novel/${id}`,
    status: 'reading',
  }) as unknown as Novel;

function openedTab() {
  return { closed: false, close: vi.fn() };
}

function signal(novelId: string, extra: Record<string, unknown>) {
  window.dispatchEvent(
    new MessageEvent('message', {
      data: { type: 'NOVEL_UPDATE_COMPLETE', novelId, ...extra },
    }),
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  window.open = vi.fn(() => openedTab()) as unknown as typeof window.open;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useRefreshAll — failure detail', () => {
  it('keeps the reason and title of each failed novel', async () => {
    const { result } = renderHook(() => useRefreshAll());
    const novels = [novel('alpha', 'Novel Alpha'), novel('beta', 'Novel Beta')];

    let run!: Promise<void>;
    act(() => {
      run = result.current.refreshAll(novels);
    });

    act(() => {
      signal('alpha', { success: true });
      signal('beta', { success: false, reason: 'no_chapter_info' });
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
      await run;
    });

    expect(result.current.failures).toEqual([
      { novelId: 'beta', title: 'Novel Beta', reason: 'no_chapter_info' },
    ]);
    expect(result.current.summary).toBe('Refreshed 1, 1 failed');
  });

  it('folds the HTTP status into an api_error reason', async () => {
    const { result } = renderHook(() => useRefreshAll());

    let run!: Promise<void>;
    act(() => {
      run = result.current.refreshAll([novel('gamma', 'Novel Gamma')]);
    });

    act(() => {
      signal('gamma', { success: false, reason: 'api_error', status: 404 });
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
      await run;
    });

    expect(result.current.failures).toEqual([
      { novelId: 'gamma', title: 'Novel Gamma', reason: 'api_error:404' },
    ]);
  });

  it('records a timeout when the tab never reports back', async () => {
    const { result } = renderHook(() => useRefreshAll());

    let run!: Promise<void>;
    act(() => {
      run = result.current.refreshAll([novel('delta', 'Novel Delta')]);
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(31_000);
      await run;
    });

    expect(result.current.failures).toEqual([
      { novelId: 'delta', title: 'Novel Delta', reason: 'timeout' },
    ]);
  });

  it('reports popup_blocked when the browser refuses the tab', async () => {
    window.open = vi.fn(() => null) as unknown as typeof window.open;
    const { result } = renderHook(() => useRefreshAll());

    let run!: Promise<void>;
    act(() => {
      run = result.current.refreshAll([novel('eps', 'Novel Epsilon')]);
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
      await run;
    });

    expect(result.current.failures).toEqual([
      { novelId: 'eps', title: 'Novel Epsilon', reason: 'popup_blocked' },
    ]);
  });

  it('leaves failures empty and the summary clean when everything succeeds', async () => {
    const { result } = renderHook(() => useRefreshAll());

    let run!: Promise<void>;
    act(() => {
      run = result.current.refreshAll([novel('zeta', 'Novel Zeta')]);
    });

    act(() => {
      signal('zeta', { success: true });
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
      await run;
    });

    expect(result.current.failures).toEqual([]);
    expect(result.current.summary).toBe('Refreshed 1 novels');
  });
});
