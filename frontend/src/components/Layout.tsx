import { NavLink, useNavigate } from 'react-router-dom';
import { useSWRConfig } from 'swr';
import { auth } from '../api/client.js';
import { NotificationBell } from './NotificationBell.js';
import { CommandPalette } from './CommandPalette.js';
import {
  BookOpenIcon, DashboardIcon, SearchIcon, GearIcon,
  WrenchIcon, ShieldIcon, LogOutIcon, ClockIcon,
} from './Icon.js';

interface Props {
  children: React.ReactNode;
}

type NavItem = { to: string; label: string; Icon: React.ComponentType<{ size?: number }> };

const NAV: NavItem[] = [
  { to: '/mylist',   label: 'My List',   Icon: BookOpenIcon },
  { to: '/dashboard',label: 'Dashboard', Icon: DashboardIcon },
  { to: '/explorer', label: 'Explorer',  Icon: SearchIcon },
  { to: '/history',  label: 'History',   Icon: ClockIcon },
  { to: '/manage',   label: 'Manage',    Icon: WrenchIcon },
  { to: '/settings', label: 'Settings',  Icon: GearIcon },
  { to: '/admin',    label: 'Admin',     Icon: ShieldIcon },
];

export function Layout({ children }: Props) {
  const navigate = useNavigate();
  const { mutate } = useSWRConfig();

  async function handleLogout() {
    await auth.logout();
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
          zIndex: 9999,
          background: 'var(--color-gold)',
          color: '#080c12',
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
          background: 'rgba(8,12,18,0.85)',
        }}
      >
        <div
          style={{
            maxWidth: 1200,
            margin: '0 auto',
            padding: '0 16px',
            height: 52,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          {/* Wordmark */}
          <span
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 700,
              fontSize: 'var(--text-lg)',
              color: 'var(--color-gold)',
              letterSpacing: '-0.02em',
              userSelect: 'none',
              marginRight: 8,
              flexShrink: 0,
            }}
          >
            ReadSync
          </span>

          {/* Nav */}
          <nav
            aria-label="Main navigation"
            style={{ display: 'flex', gap: 2, flex: 1, overflowX: 'auto', scrollbarWidth: 'none' }}
          >
            {NAV.map(({ to, label, Icon }) => (
              <NavLink
                key={to}
                to={to}
                style={({ isActive }) => ({
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '0 10px',
                  height: 44,
                  borderRadius: 'var(--radius-md)',
                  fontSize: 'var(--text-sm)',
                  fontWeight: 500,
                  color: isActive ? 'var(--color-text)' : 'var(--color-text-muted)',
                  background: isActive ? 'rgba(255,255,255,0.08)' : 'transparent',
                  transition: 'background 0.15s, color 0.15s',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                  textDecoration: 'none',
                })}
              >
                <Icon size={14} />
                <span className="nav-label">{label}</span>
              </NavLink>
            ))}
          </nav>

          <NotificationBell />

          {/* Logout */}
          <button
            onClick={() => { void handleLogout(); }}
            aria-label="Log out"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              height: 44,
              padding: '0 8px',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--color-text-muted)',
              fontSize: 'var(--text-sm)',
              borderRadius: 'var(--radius-md)',
              transition: 'color 0.15s',
              flexShrink: 0,
              touchAction: 'manipulation',
            }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-text)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-text-muted)')}
          >
            <LogOutIcon size={14} />
            <span className="nav-label">Sign out</span>
          </button>
        </div>
      </header>

      {/* Page content */}
      <main
        id="main-content"
        style={{
          flex: 1,
          maxWidth: 1200,
          width: '100%',
          margin: '0 auto',
          padding: '24px 16px 48px',
        }}
      >
        {children}
      </main>
    </div>
  );
}
