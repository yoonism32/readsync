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

  it('does not close a slow tab when its batch siblings finish', async () => {
    // BATCH_SIZE is 3, so these go out together. Two report back, one never
    // does. The slow tab must survive its siblings' close() calls and only be
    // closed by its own 30s timeout.
    const tabs = new Map<string, ReturnType<typeof openedTab>>();
    window.open = vi.fn((_url: string, name: string) => {
      const t = openedTab();
      tabs.set(name, t);
      return t;
    }) as unknown as typeof window.open;

    const { result } = renderHook(() => useRefreshAll());
    let run!: Promise<void>;
    act(() => {
      run = result.current.refreshAll([
        novel('a', 'Novel A'),
        novel('b', 'Novel B'),
        novel('slow', 'Novel Slow'),
      ]);
    });

    act(() => {
      signal('a', { success: true });
      signal('b', { success: true });
    });

    // Past the 1s grace: the two responders have closed.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(tabs.get('_novel_a')?.close).toHaveBeenCalled();
    expect(tabs.get('_novel_b')?.close).toHaveBeenCalled();
    // The crux: nothing has touched the slow tab.
    expect(tabs.get('_novel_slow')?.close).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(29_000);
      await run;
    });
    expect(tabs.get('_novel_slow')?.close).toHaveBeenCalled();
    expect(result.current.failures).toEqual([
      { novelId: 'slow', title: 'Novel Slow', reason: 'timeout' },
    ]);
  });

  it('counts an externally closed tab as success without any scrape', async () => {
    // Documents the tab.closed watcher: anything that closes the tab - the
    // browser, the user, a tab-group sweep - resolves as ok even though the
    // userscript never reported.
    const tab = openedTab();
    window.open = vi.fn(() => tab) as unknown as typeof window.open;

    const { result } = renderHook(() => useRefreshAll());
    let run!: Promise<void>;
    act(() => {
      run = result.current.refreshAll([novel('ghost', 'Novel Ghost')]);
    });

    tab.closed = true;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
      await run;
    });

    expect(result.current.failures).toEqual([]);
    expect(result.current.summary).toBe('Refreshed 1 novels');
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
