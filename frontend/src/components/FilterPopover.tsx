import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

/**
 * A filter control that opens an anchored panel, replacing the native <select>
 * so a single control can hold multi-select, tri-state and radio content.
 * Closes on outside click and on Escape, and returns focus to its trigger.
 */
export function FilterPopover({
  label,
  active = false,
  panelWidth = 320,
  children,
}: {
  label: string;
  active?: boolean;
  panelWidth?: number;
  children: ReactNode | ((close: () => void) => ReactNode);
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(e: MouseEvent | TouchEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-haspopup="true"
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          background: active ? 'var(--color-accent-glow)' : 'var(--color-bg-input)',
          border: `1px solid ${active || open ? 'var(--color-accent-border)' : 'var(--color-border)'}`,
          borderRadius: 'var(--radius-md)',
          padding: '8px 10px',
          color: active ? 'var(--color-accent)' : 'var(--color-text)',
          fontSize: 'var(--text-sm)',
          fontFamily: 'inherit',
          fontWeight: active ? 600 : 400,
          textAlign: 'left',
          cursor: 'pointer',
          touchAction: 'manipulation',
        }}
      >
        <span
          style={{
            flex: 1,
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {label}
        </span>
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden="true"
          style={{ flexShrink: 0, transform: open ? 'rotate(180deg)' : undefined, transition: 'transform 0.15s' }}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div
          className="glass"
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            zIndex: 60,
            width: panelWidth,
            maxWidth: 'min(92vw, 460px)',
            maxHeight: 340,
            overflowY: 'auto',
            borderRadius: 'var(--radius-lg)',
            padding: 14,
            // The glass class is translucent; filter panels sit over content,
            // so give it an opaque backdrop or the text behind bleeds through.
            background: 'var(--color-bg-raised)',
            boxShadow: '0 16px 40px rgba(0,0,0,0.55)',
          }}
        >
          {typeof children === 'function' ? children(() => setOpen(false)) : children}
        </div>
      )}
    </div>
  );
}
