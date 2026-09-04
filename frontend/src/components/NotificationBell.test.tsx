import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { SWRConfig } from 'swr';
import { NotificationBell } from './NotificationBell.js';

const mocks = vi.hoisted(() => ({
  unreadCount: vi.fn(),
  list: vi.fn(),
}));

vi.mock('../api/client.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  const actualNotifications = actual.notifications as Record<string, unknown>;
  return {
    ...actual,
    notifications: {
      ...actualNotifications,
      unreadCount: mocks.unreadCount,
      list: mocks.list,
    },
  };
});

function renderBell() {
  return render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <MemoryRouter>
        <NotificationBell />
      </MemoryRouter>
    </SWRConfig>,
  );
}

describe('NotificationBell egress split', () => {
  beforeEach(() => {
    mocks.unreadCount.mockResolvedValue({ unread_count: 3 });
    mocks.list.mockResolvedValue({
      notifications: [
        {
          id: 1,
          novel_id: 'novelbin:some-novel',
          type: 'new_chapter',
          message: 'Chapter 7151 is out',
          read: false,
          created_at: new Date().toISOString(),
          novel_title: 'Some Novel',
        },
      ],
      unread_count: 3,
    });
  });

  afterEach(cleanup);

  // The whole point of the split: the bell mounts in Layout on every page, so
  // a closed bell must never pull the 50-row list. Regressing this reinstates
  // the highest-call-count query in the database.
  it('polls only the count while closed, never the list', async () => {
    renderBell();
    await waitFor(() => expect(mocks.unreadCount).toHaveBeenCalled());
    expect(mocks.list).not.toHaveBeenCalled();
    expect(await screen.findByText('3')).toBeTruthy();
  });

  it('fetches the list only once the panel is opened', async () => {
    renderBell();
    await waitFor(() => expect(mocks.unreadCount).toHaveBeenCalled());

    await userEvent.click(screen.getByRole('button', { name: /notifications/i }));

    await waitFor(() => expect(mocks.list).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('Chapter 7151 is out')).toBeTruthy();
  });
});
