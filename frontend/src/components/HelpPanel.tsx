import { useEffect, useRef, useState } from 'react';
import { HelpCircleIcon } from './Icon.js';

const isMac = typeof navigator !== 'undefined' && /Mac/.test(navigator.userAgent);

const ENTRIES: { term: string; body: string }[] = [
  {
    term: `Command palette — ${isMac ? '⌘K' : 'Ctrl+K'}`,
    body: 'Search your library or jump to any page from anywhere in the app.',
  },
  {
    term: 'Novels behind',
    body: 'Novels where the source site has more chapters than you’ve synced.',
  },
  {
    term: 'Sync conflicts',
    body: 'Two of your devices report different reading progress for the same novel.',
  },
  {
    term: 'New chapters',
    body: 'Newly discovered chapters across your library since the last check.',
  },
];

// The audit's worst-scoring heuristic (Help & Documentation, 1/4) was no
// affordance anywhere across 5 screens. This is deliberately a static,
// no-backend panel — a real onboarding flow is a separate, bigger item if
// this turns out not to be enough.
export function HelpPanel() {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

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

  return (
    <div ref={panelRef} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        onClick={() => setOpen(o => !o)}
        aria-label="Help"
        aria-expanded={open}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
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
        <HelpCircleIcon size={16} />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Help"
          className="glass"
          style={{
            position: 'absolute',
            right: 0,
            top: 48,
            width: 'min(320px, calc(100vw - 24px))',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--color-border)',
            background: 'var(--color-bg-raised)',
            boxShadow: '0 12px 32px rgba(0,0,0,0.5)',
            zIndex: 100,
            padding: '10px 14px 14px',
          }}
        >
          <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)', padding: '4px 0 10px' }}>
            Quick help
          </div>
          {ENTRIES.map(({ term, body }) => (
            <div key={term} style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-text)' }}>
                {term}
              </div>
              <div className="text-muted" style={{ fontSize: 'var(--text-xs)', marginTop: 2 }}>
                {body}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
