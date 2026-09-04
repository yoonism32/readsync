import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, act, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SWRConfig } from 'swr';
import { Layout } from './Layout.js';

type Handler = (payload: unknown) => void;

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, Set<Handler>>(),
  socket: null as unknown,
}));

function emit(event: string, payload: unknown = {}) {
  for (const h of mocks.handlers.get(event) ?? []) h(payload);
}

vi.mock('../hooks/useSocket.js', () => ({
  useSocket: () => mocks.socket,
  disconnectSocket: vi.fn(),
  reconnectSocket: vi.fn(),
}));

vi.mock('../api/client.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    hasApiKey: () => true,
    getApiKey: () => 'test-key',
    auth: { recoverApiKey: vi.fn(), logout: vi.fn() },
    notifications: {
      unreadCount: vi.fn().mockResolvedValue({ unread_count: 0 }),
      list: vi.fn().mockResolvedValue({ notifications: [], unread_count: 0 }),
    },
  };
});

function liveRegion(): HTMLElement {
  const node = document.querySelector('[aria-live="polite"]');
  if (!node) throw new Error('live region not rendered');
  return node as HTMLElement;
}

describe('Layout socket live region', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mocks.handlers.clear();
    mocks.socket = {
      on: (event: string, handler: Handler) => {
        if (!mocks.handlers.has(event)) mocks.handlers.set(event, new Set());
        mocks.handlers.get(event)?.add(handler);
      },
      off: (event: string, handler: Handler) => {
        mocks.handlers.get(event)?.delete(handler);
      },
    };
    render(
      <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
        <MemoryRouter>
          <Layout><p>content</p></Layout>
        </MemoryRouter>
      </SWRConfig>,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it('renders an empty polite live region before any event', () => {
    expect(liveRegion().textContent).toBe('');
  });

  it('announces a chapters:updated event', async () => {
    act(() => { emit('chapters:updated'); });
    await waitFor(() =>
      expect(liveRegion().textContent).toMatch(/Library updated/i));
  });

  // The reason this is rate-limited at all: progress:updated fires on every
  // scroll-throttled sync ping. Announcing each one turns the live region
  // into a continuous read-out for the whole reading session.
  it('coalesces a burst of progress:updated into one announcement', async () => {
    act(() => {
      for (let i = 0; i < 25; i++) {
        emit('progress:updated', { novel_id: 'n1', latest_global: null, latest_per_device: null, read_through: 1, timestamp: '' });
      }
    });
    await waitFor(() =>
      expect(liveRegion().textContent).toMatch(/Reading progress updated/i));

    // A second burst inside the window must not re-announce. Clearing the
    // region first makes a re-announce observable rather than invisible.
    const before = liveRegion().textContent;
    act(() => { emit('chapters:updated'); });
    expect(liveRegion().textContent).toBe(before);
  });

  it('announces again once the interval has elapsed', async () => {
    act(() => { emit('progress:updated', { novel_id: 'n1', latest_global: null, latest_per_device: null, read_through: 1, timestamp: '' }); });
    await waitFor(() =>
      expect(liveRegion().textContent).toMatch(/Reading progress updated/i));

    act(() => { vi.advanceTimersByTime(31_000); });
    act(() => { emit('chapters:updated'); });
    await waitFor(() =>
      expect(liveRegion().textContent).toMatch(/Library updated/i));
  });
});
