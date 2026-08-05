import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useSWR from 'swr';
import { notifications as notificationsApi, formatTimestamp } from '../api/client.js';
import type { NotificationsResponse } from '../types/index.js';
import { BellIcon } from './Icon.js';

const POLL_MS = 60_000;

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const { data, mutate } = useSWR<NotificationsResponse>(
    'notifications-list',
    () => notificationsApi.list(),
    { refreshInterval: POLL_MS, revalidateOnFocus: true }
  );

  const unread = data?.unread_count ?? 0;
  const items = data?.notifications ?? [];

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  async function openNotification(id: number, novelId: string) {
    setOpen(false);
    await notificationsApi.markRead(id);
    void mutate();
    navigate(`/novel/${encodeURIComponent(novelId)}`);
  }

  async function markAll() {
    await notificationsApi.markAllRead();
    void mutate();
  }

  return (
    <div ref={panelRef} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        onClick={() => setOpen(o => !o)}
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
        aria-expanded={open}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          height: 44,
          width: 40,
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          ...(open ? { color: 'var(--color-accent)' } : null),
          borderRadius: 'var(--radius-md)',
          touchAction: 'manipulation',
        }}
      >
        <BellIcon size={16} />
        {unread > 0 && (
          <span
            className="tabular"
            style={{
              position: 'absolute',
              top: 6,
              right: 2,
              minWidth: 15,
              height: 15,
              padding: '0 4px',
              borderRadius: 999,
              background: 'var(--color-accent)',
              color: 'var(--color-on-accent)',
              fontSize: 10,
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              lineHeight: 1,
            }}
          >
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="glass"
          style={{
            position: 'absolute',
            right: 0,
            top: 48,
            width: 'min(340px, calc(100vw - 24px))',
            maxHeight: 420,
            overflowY: 'auto',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--color-border)',
            background: 'var(--color-bg-raised)',
            boxShadow: '0 12px 32px rgba(0,0,0,0.5)',
            zIndex: 100,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 14px',
              borderBottom: '1px solid var(--color-border)',
              position: 'sticky',
              top: 0,
              background: 'var(--color-bg-raised)',
            }}
          >
            <span style={{ fontWeight: 600, fontSize: 'var(--text-sm)' }}>Notifications</span>
            {unread > 0 && (
              <button
                onClick={() => { void markAll(); }}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--color-accent)',
                  fontSize: 'var(--text-xs)',
                  padding: 0,
                }}
              >
                Mark all read
              </button>
            )}
          </div>

          {items.length === 0 ? (
            <p className="text-muted" style={{ padding: '20px 14px', fontSize: 'var(--text-sm)', margin: 0 }}>
              Nothing yet — new chapters found by Update All land here.
            </p>
          ) : (
            items.map(n => (
              <button
                key={n.id}
                role="menuitem"
                onClick={() => { void openNotification(n.id, n.novel_id); }}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '10px 14px',
                  background: n.read ? 'transparent' : 'var(--color-accent-glow)',
                  border: 'none',
                  borderBottom: '1px solid var(--color-border)',
                  cursor: 'pointer',
                }}
              >
                <span
                  style={{
                    display: 'block',
                    fontSize: 'var(--text-sm)',
                    color: 'var(--color-text)',
                    fontWeight: n.read ? 400 : 600,
                    marginBottom: 2,
                  }}
                >
                  {n.message}
                </span>
                <span className="text-faint" style={{ fontSize: 'var(--text-xs)' }}>
                  {formatTimestamp(n.created_at)}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
