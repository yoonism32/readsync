import { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useSWRConfig } from 'swr';
import { ChevronDown } from 'lucide-react';
import { auth, setApiKey } from '../api/client.js';
import { applyProgressUpdate } from '../api/normalize.js';
import type { RawLatestProgress } from '../api/normalize.js';
import { useSocket, disconnectSocket } from '../hooks/useSocket.js';
import type { Novel } from '../types/index.js';
import { NotificationBell } from './NotificationBell.js';
import { HelpPanel } from './HelpPanel.js';
import { CommandPalette } from './CommandPalette.js';
import {
  BookOpenIcon, DashboardIcon, SearchIcon, GearIcon,
  WrenchIcon, ShieldIcon, LogOutIcon, ClockIcon, BarChartIcon,
  SparklesIcon,
} from './Icon.js';

interface Props {
  children: React.ReactNode;
}

type NavItem = { to: string; label: string; Icon: React.ComponentType<{ size?: number }> };

const PRIMARY: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard', Icon: DashboardIcon },
  { to: '/mylist', label: 'My List', Icon: BookOpenIcon },
  { to: '/explorer', label: 'Explorer', Icon: SearchIcon },
  { to: '/history', label: 'History', Icon: ClockIcon },
  { to: '/stats', label: 'Stats', Icon: BarChartIcon },
];
const MORE: NavItem[] = [
  { to: '/replay', label: 'Replay', Icon: SparklesIcon },
  { to: '/manage', label: 'Manage', Icon: WrenchIcon },
  { to: '/settings', label: 'Settings', Icon: GearIcon },
  { to: '/admin', label: 'Admin', Icon: ShieldIcon },
];
const NAV = [...PRIMARY, ...MORE]; // still used by the document.title effect

const navStyle = (isActive: boolean): React.CSSProperties => ({
  position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 7,
  padding: '0 12px', height: 52, borderRadius: 'var(--radius-md)',
  fontSize: 'var(--text-base)', fontWeight: 500,
  color: isActive ? 'var(--color-accent-bright)' : 'var(--color-text-muted)',
  background: isActive ? 'rgba(255,255,255,0.08)' : 'transparent',
  transition: 'background 0.15s, color 0.15s',
  whiteSpace: 'nowrap', flexShrink: 0, textDecoration: 'none',
});

export function Layout({ children }: Props) {
  const location = useLocation();
  const navigate = useNavigate();
  const { mutate } = useSWRConfig();
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

  // Stores the path the menu was opened on, so navigating away closes it
  // without a setState-in-effect.
  const [moreOpenPath, setMoreOpenPath] = useState<string | null>(null);
  const moreOpen = moreOpenPath === location.pathname;
  const moreRef = useRef<HTMLDivElement>(null);
  const moreActive = MORE.some(i => location.pathname.startsWith(i.to));

  useEffect(() => {
    if (!moreOpen) return;
    const onDown = (e: MouseEvent) => { if (!moreRef.current?.contains(e.target as Node)) setMoreOpenPath(null); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMoreOpenPath(null); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [moreOpen]);

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

    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    const scheduleRefresh = () => {
      if (refreshTimer) return;
      refreshTimer = setTimeout(() => {
        refreshTimer = undefined;
        void mutate('/novels');
      }, 1000);
    };
    const refreshNovels = () => {
      announce('Library updated.');
      scheduleRefresh();
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
        current => {
          const existing = current?.find(n => n.novel_id === payload.novel_id);
          if (!existing || existing.current_read_through !== payload.read_through) scheduleRefresh();
          return current?.map(n =>
            n.novel_id === payload.novel_id
              ? applyProgressUpdate(n, {
                latest_global: payload.latest_global,
                latest_per_device: payload.latest_per_device,
                current_read_through: payload.read_through,
                last_activity: payload.timestamp,
              })
              : n,
          );
        },
        { revalidate: false },
      );
      announce('Reading progress updated.');
    };

    // chapters:updated means the novel's chapter count/title changed (a
    // scrape found a new release) — that's not in the progress payload, so
    // this one still needs a real refetch.
    socket.on('chapters:updated', refreshNovels);
    socket.on('connect', refreshNovels);
    socket.on('progress:updated', applyProgressPatch);
    return () => {
      clearTimeout(refreshTimer);
      socket.off('connect', refreshNovels);
      socket.off('chapters:updated', refreshNovels);
      socket.off('progress:updated', applyProgressPatch);
    };
  }, [socket, mutate]);

  useEffect(() => {
    setApiKey(''); // Remove credentials retained by older releases.
    const onStorage = (event: StorageEvent) => {
      if (event.key !== 'readsync:logout') return;
      disconnectSocket();
      void mutate(() => true, undefined, { revalidate: false });
      navigate('/login');
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [mutate, navigate]);

  async function handleLogout() {
    await auth.logout();
    localStorage.setItem('readsync:logout', String(Date.now()));
    disconnectSocket();
    setApiKey('');
    await mutate(() => true, undefined, { revalidate: false });
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
        className="app-header"
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
          className="app-header-inner"
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
            className="app-main-nav"
            ref={navRef}
            aria-label="Main navigation"
            style={{
              display: 'flex', gap: 2, flex: 1, overflowX: 'auto', scrollbarWidth: 'none',
              maskImage: navOverflowing ? 'linear-gradient(to right, transparent, black 16px, black calc(100% - 16px), transparent)' : 'none',
              WebkitMaskImage: navOverflowing ? 'linear-gradient(to right, transparent, black 16px, black calc(100% - 16px), transparent)' : 'none',
            }}
          >
            {PRIMARY.map(({ to, label, Icon }) => (
              <NavLink key={to} to={to} aria-label={label} style={({ isActive }) => navStyle(isActive)}>
                <Icon size={16} />
                <span className="nav-label">{label}</span>
              </NavLink>
            ))}
          </nav>

          {/* Outside <nav>: its overflowX would clip the dropdown. */}
          <div ref={moreRef} style={{ position: 'relative', flexShrink: 0 }}>
            <button
              type="button"
              aria-haspopup="menu"
              aria-expanded={moreOpen}
              onClick={() => setMoreOpenPath(moreOpen ? null : location.pathname)}
              style={{ ...navStyle(moreActive), border: 'none', font: 'inherit', cursor: 'pointer', minWidth: 0 }}
            >
              <span className="nav-label">More</span>
              <ChevronDown size={14} />
            </button>
            {moreOpen && (
              <div
                role="menu"
                style={{
                  position: 'absolute', top: '100%', right: 0, marginTop: 4, minWidth: 200, padding: 4,
                  background: 'var(--color-bg-raised)', border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-lg)', boxShadow: '0 12px 32px rgba(0,0,0,0.5)',
                  zIndex: 'var(--z-dropdown, 60)', display: 'flex', flexDirection: 'column', gap: 2,
                }}
              >
                {MORE.map(({ to, label, Icon }) => (
                  <NavLink key={to} to={to} role="menuitem" style={({ isActive }) => ({ ...navStyle(isActive), height: 40, width: '100%' })}>
                    <Icon size={16} />{label}
                  </NavLink>
                ))}
                <div style={{ height: 1, background: 'var(--color-border)', margin: '4px 6px' }} />
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => { void handleLogout(); }}
                  style={{ ...navStyle(false), height: 40, width: '100%', border: 'none', font: 'inherit', cursor: 'pointer', minWidth: 0 }}
                >
                  <LogOutIcon size={16} />Sign out
                </button>
              </div>
            )}
          </div>

          <button
            type="button"
            className="header-search"
            onClick={() => window.dispatchEvent(new Event('readsync:open-palette'))}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, height: 40, padding: '0 12px', width: 240,
              flexShrink: 0, border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)',
              background: 'rgba(255,255,255,0.06)', color: 'var(--color-text-muted)',
              font: 'inherit', fontSize: 'var(--text-sm)', cursor: 'pointer', minWidth: 0,
            }}
          >
            <SearchIcon size={15} />
            <span style={{ flex: 1, textAlign: 'left' }}>Search or jump to…</span>
            <kbd style={{
              fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12, color: 'var(--color-text-faint)',
              border: '1px solid var(--color-border)', borderRadius: 4, padding: '1px 5px',
            }}>⌘K</kbd>
          </button>

          <HelpPanel />
          <NotificationBell />
        </div>
      </header>

      {/* Page content */}
      {/* MyList's table grows with its widest title (real <table>, one shared
          column width for every row) — give it more room than the 1440
          default so that growth doesn't immediately force the table's own
          horizontal scrollbar. Explorer's list-view cards are wider than
          the 1440 default too, so it gets the same kind of exception —
          bounded and centered, not full-bleed, so the search bar/toolbar
          above the grid still lines up with it. */}
      <main
        id="main-content"
        style={{
          flex: 1,
          maxWidth: location.pathname === '/mylist' ? 1900 : location.pathname === '/explorer' ? 2000 : 1440,
          width: '100%',
          margin: '0 auto',
          padding: '28px 28px 56px',
        }}
      >
        {children}
        <div aria-live="polite" aria-atomic="true" className="sr-only">
          {announcement}
        </div>
      </main>
    </div>
  );
}
