import { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useSWRConfig } from 'swr';
import { auth, hasApiKey, setApiKey } from '../api/client.js';
import { applyProgressUpdate } from '../api/normalize.js';
import type { RawLatestProgress } from '../api/normalize.js';
import { useSocket, disconnectSocket, reconnectSocket } from '../hooks/useSocket.js';
import type { Novel } from '../types/index.js';
import { NotificationBell } from './NotificationBell.js';
import { CommandPalette } from './CommandPalette.js';
import {
  BookOpenIcon, DashboardIcon, SearchIcon, GearIcon,
  WrenchIcon, ShieldIcon, LogOutIcon, ClockIcon, BarChartIcon,
} from './Icon.js';

interface Props {
  children: React.ReactNode;
}

type NavItem = { to: string; label: string; Icon: React.ComponentType<{ size?: number }> };

const NAV: NavItem[] = [
  { to: '/mylist', label: 'My List', Icon: BookOpenIcon },
  { to: '/dashboard', label: 'Dashboard', Icon: DashboardIcon },
  { to: '/explorer', label: 'Explorer', Icon: SearchIcon },
  { to: '/history', label: 'History', Icon: ClockIcon },
  { to: '/stats', label: 'Stats', Icon: BarChartIcon },
  { to: '/manage', label: 'Manage', Icon: WrenchIcon },
  { to: '/settings', label: 'Settings', Icon: GearIcon },
  { to: '/admin', label: 'Admin', Icon: ShieldIcon },
];

export function Layout({ children }: Props) {
  const location = useLocation();
  const navigate = useNavigate();
  const { mutate } = useSWRConfig();
  const [keyMissing, setKeyMissing] = useState(false);
  const socket = useSocket();
  const navRef = useRef<HTMLElement>(null);
  // Screen readers get no signal when the socket patches the page under them.
  // progress:updated fires on every scroll-throttled sync ping, so this is
  // rate-limited rather than announced per event — an unthrottled live region
  // here would read out a continuous stream during any reading session.
  const [announcement, setAnnouncement] = useState('');
  const lastAnnouncedAt = useRef(0);
  // The edge-fade mask below is only a "there's more, scroll for it" signal
  // — it should stay off whenever every nav item already fits, otherwise it
  // fades the first/last item's content (including an active tab's
  // highlight pill) for no reason, e.g. "My List" being first meant its
  // pill's left edge always looked cut off behind the logo.
  const [navOverflowing, setNavOverflowing] = useState(false);

  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const check = () => setNavOverflowing(nav.scrollWidth > nav.clientWidth);
    check();
    const observer = new ResizeObserver(check);
    observer.observe(nav);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (location.pathname.startsWith('/novel/')) return;
    const pageName = NAV.find(item => location.pathname.startsWith(item.to))?.label
      ?? 'ReadSync';
    document.title = `${pageName} | ReadSync`;
  }, [location.pathname]);

  // Push-based library refresh: the poll interval in Dashboard/Explorer/
  // Manage/MyList is now just a safety net for a silently-dead socket, not
  // the primary update path. Both events are invalidation-only signals —
  // neither carries enough to patch state directly, so SWR stays the single
  // source of truth and this never becomes a second, divergent data path.
  useEffect(() => {
    if (!socket) return;

    const ANNOUNCE_INTERVAL_MS = 30_000;
    const announce = (message: string) => {
      const now = Date.now();
      if (now - lastAnnouncedAt.current < ANNOUNCE_INTERVAL_MS) return;
      lastAnnouncedAt.current = now;
      // Re-announce an identical message by clearing first — assistive tech
      // reads a live region on text *change*, so setting the same string
      // twice in a row would be silent.
      setAnnouncement('');
      requestAnimationFrame(() => setAnnouncement(message));
    };

    const refreshNovels = () => {
      void mutate('/novels');
      announce('Library updated with new chapters.');
    };

    // progress:updated fires on every scroll-throttled sync ping from an
    // active reading session, already scoped to one novel_id, and its
    // payload already carries getLatestStates()'s full latest_global/
    // latest_per_device — everything the /novels list needs for that one
    // row (see src/routes/progress.ts, src/services/NovelService.ts). A
    // full mutate('/novels') refetch here (even debounced) re-ran the
    // ~140-row nested-JSON query on every ping and was the largest single
    // egress contributor found in the 2026-08-18 and 2026-08-20 incidents.
    // Patch the matching row in place instead: zero HTTP requests, zero
    // Postgres reads, no staleness window to trade off against DB load.
    const applyProgressPatch = (payload: {
      novel_id: string;
      latest_global: RawLatestProgress | null;
      latest_per_device: Record<string, RawLatestProgress> | null;
      read_through: number;
      timestamp: string;
    }) => {
      void mutate<Novel[]>(
        '/novels',
        current =>
          current?.map(n =>
            n.novel_id === payload.novel_id
              ? applyProgressUpdate(n, {
                latest_global: payload.latest_global,
                latest_per_device: payload.latest_per_device,
                current_read_through: payload.read_through,
                last_activity: payload.timestamp,
              })
              : n,
          ),
        { revalidate: false },
      );
      announce('Reading progress updated.');
    };

    // chapters:updated means the novel's chapter count/title changed (a
    // scrape found a new release) — that's not in the progress payload, so
    // this one still needs a real refetch.
    socket.on('chapters:updated', refreshNovels);
    socket.on('progress:updated', applyProgressPatch);
    return () => {
      socket.off('chapters:updated', refreshNovels);
      socket.off('progress:updated', applyProgressPatch);
    };
  }, [socket, mutate]);

  useEffect(() => {
    if (hasApiKey()) return;
    // Self-heal: the session is already authenticated at this point
    // (RequireAuth gated the route), so recover the account's API key
    // instead of leaving the app silently empty.
    auth
      .recoverApiKey()
      .then(res => {
        if (res.api_key) {
          setApiKey(res.api_key);
          reconnectSocket();
          void mutate(() => true);
        } else {
          setKeyMissing(true);
        }
      })
      .catch(() => setKeyMissing(true));
  }, [mutate]);

  async function handleLogout() {
    await auth.logout();
    disconnectSocket();
    await mutate('auth-status');
    navigate('/login');
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh' }}>
      <CommandPalette />
      {/* Skip link — accessibility */}
      <a
        href="#main-content"
        style={{
          position: 'absolute',
          left: -9999,
          top: 8,
          zIndex: 'var(--z-skip-link)',
          background: 'var(--color-accent)',
          color: 'var(--color-on-accent)',
          padding: '8px 16px',
          borderRadius: 'var(--radius-md)',
          fontWeight: 600,
          fontSize: 'var(--text-sm)',
          textDecoration: 'none',
        }}
        onFocus={e => { e.currentTarget.style.left = '8px'; }}
        onBlur={e => { e.currentTarget.style.left = '-9999px'; }}
      >
        Skip to main content
      </a>

      {/* Top bar */}
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 'var(--z-sticky)',
          borderBottom: '1px solid var(--color-border)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          background: 'var(--color-bg-header)',
        }}
      >
        <div
          style={{
            maxWidth: 1440,
            margin: '0 auto',
            padding: '0 28px',
            height: 64,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          {/* Logomark + wordmark */}
          <img
            src="/app/favicon.svg"
            alt=""
            width={32}
            height={32}
            style={{ flexShrink: 0, borderRadius: 8 }}
          />
          <span
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 700,
              fontSize: 'var(--text-xl)',
              color: 'var(--color-accent)',
              letterSpacing: '-0.02em',
              userSelect: 'none',
              marginRight: 10,
              flexShrink: 0,
            }}
          >
            ReadSync
          </span>

          {/* Nav */}
          {/* maskImage fades both edges so a scrollable overflow (narrow
              viewports, or once more sections are added) always shows a visual
              "there's more" signal instead of items silently scrolling off
              with zero affordance — gated on navOverflowing so it's off
              whenever every item already fits (the common case), since
              otherwise it always fades the first item's content, including
              an active tab's highlight pill. */}
          <nav
            ref={navRef}
            aria-label="Main navigation"
            style={{
              display: 'flex', gap: 2, flex: 1, overflowX: 'auto', scrollbarWidth: 'none',
              maskImage: navOverflowing ? 'linear-gradient(to right, transparent, black 16px, black calc(100% - 16px), transparent)' : 'none',
              WebkitMaskImage: navOverflowing ? 'linear-gradient(to right, transparent, black 16px, black calc(100% - 16px), transparent)' : 'none',
            }}
          >
            {NAV.map(({ to, label, Icon }) => (
              <NavLink
                key={to}
                to={to}
                aria-label={label}
                style={({ isActive }) => ({
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 7,
                  padding: '0 12px',
                  height: 52,
                  borderRadius: 'var(--radius-md)',
                  fontSize: 'var(--text-base)',
                  fontWeight: 500,
                  color: isActive ? 'var(--color-text)' : 'var(--color-text-muted)',
                  background: isActive ? 'rgba(255,255,255,0.08)' : 'transparent',
                  transition: 'background 0.15s, color 0.15s',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                  textDecoration: 'none',
                })}
              >
                <Icon size={16} />
                <span className="nav-label">{label}</span>
              </NavLink>
            ))}
          </nav>

          <NotificationBell />

          {/* Logout */}
          <button
            onClick={() => { void handleLogout(); }}
            aria-label="Log out"
            className="muted-btn"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 7,
              height: 52,
              padding: '0 14px',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: 'var(--text-base)',
              borderRadius: 'var(--radius-md)',
              flexShrink: 0,
              touchAction: 'manipulation',
            }}
          >
            <LogOutIcon size={16} />
            <span className="nav-label">Sign out</span>
          </button>
        </div>
      </header>

      {/* Page content */}
      {/* MyList's table grows with its widest title (real <table>, one shared
          column width for every row) — give it more room than the 1440
          default so that growth doesn't immediately force the table's own
          horizontal scrollbar. */}
      <main
        id="main-content"
        style={{
          flex: 1,
          maxWidth: location.pathname === '/mylist' ? 1900 : 1440,
          width: '100%',
          margin: '0 auto',
          padding: '28px 28px 56px',
        }}
      >
        {keyMissing && (
          <div
            className="panel"
            style={{
              borderRadius: 'var(--radius-lg)',
              padding: '12px 16px',
              marginBottom: 20,
              border: '1px solid var(--color-danger)',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              flexWrap: 'wrap',
              fontSize: 'var(--text-sm)',
            }}
          >
            <span>Couldn’t find your API key — your library won’t load until it’s set.</span>
            <NavLink to="/settings" style={{ color: 'var(--color-accent-bright)', fontWeight: 600 }}>
              Go to Settings →
            </NavLink>
          </div>
        )}
        {children}
        <div aria-live="polite" aria-atomic="true" className="sr-only">
          {announcement}
        </div>
      </main>
    </div>
  );
}
