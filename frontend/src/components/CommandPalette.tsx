import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import useSWR, { useSWRConfig } from 'swr';
import toast from 'react-hot-toast';
import { fetchNovels, resumeUrl, copyResumeLink, novels as novelsApi } from '../api/client.js';
import { rankItems } from '../lib/fuzzy.js';
import { BookOpenIcon } from './Icon.js';
import type { Novel, NovelStatus } from '../types/index.js';

interface PageCommand {
  kind: 'page';
  label: string;
  to: string;
}

interface NovelCommand {
  kind: 'novel';
  label: string;
  novel: Novel;
}

type Command = PageCommand | NovelCommand;

const PAGES: PageCommand[] = [
  { kind: 'page', label: 'Go to Dashboard', to: '/dashboard' },
  { kind: 'page', label: 'Go to My List', to: '/mylist' },
  { kind: 'page', label: 'Go to History', to: '/history' },
  { kind: 'page', label: 'Go to Explorer', to: '/explorer' },
  { kind: 'page', label: 'Go to Manage', to: '/manage' },
  { kind: 'page', label: 'Go to Settings', to: '/settings' },
];

const STATUS_OPTIONS: NovelStatus[] = ['reading', 'plan-to-read', 'completed', 'on-hold', 'dropped'];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const [statusFor, setStatusFor] = useState<Novel | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { mutate } = useSWRConfig();

  const { data } = useSWR<Novel[]>(open ? '/novels' : null, fetchNovels, {
    revalidateOnFocus: false,
  });

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(prev => !prev);
        setQuery('');
        setCursor(0);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const commands = useMemo<Command[]>(() => {
    const novels: NovelCommand[] = (data ?? [])
      .filter(n => n.status !== 'removed')
      .map(n => ({ kind: 'novel', label: n.title, novel: n }));
    return [...PAGES, ...novels];
  }, [data]);

  const results = useMemo(
    () => rankItems(query, commands, c => c.label),
    [query, commands],
  );

  const close = () => {
    setOpen(false);
    setQuery('');
    setCursor(0);
    setStatusFor(null);
  };

  const applyStatus = async (novel: Novel, status: NovelStatus) => {
    close();
    try {
      await novelsApi.setStatus(novel.novel_id, status);
      await mutate('/novels');
      toast.success(`${novel.title} → ${status}`);
    } catch {
      toast.error('Failed to update status');
    }
  };

  const run = (cmd: Command, resume: boolean) => {
    close();
    if (cmd.kind === 'page') {
      navigate(cmd.to);
      return;
    }
    if (resume && cmd.novel.latest_url) {
      window.open(
        resumeUrl(cmd.novel.latest_url, cmd.novel.latest_percent),
        '_blank',
        'noopener',
      );
      return;
    }
    navigate(`/novel/${encodeURIComponent(cmd.novel.novel_id)}`);
  };

  if (!open) return null;

  const listLength = statusFor ? STATUS_OPTIONS.length : results.length;
  const clamped = Math.min(cursor, Math.max(0, listLength - 1));

  // Keep Tab from escaping the dialog into the page behind the overlay —
  // the dialog only ever contains the search input in practice, but this
  // stays correct if more focusable elements are added later.
  const trapFocus = (e: ReactKeyboardEvent) => {
    const focusable = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) ?? [],
    );
    if (focusable.length === 0) return;
    e.preventDefault();
    const activeIndex = focusable.indexOf(document.activeElement as HTMLElement);
    const delta = e.shiftKey ? -1 : 1;
    focusable[(activeIndex + delta + focusable.length) % focusable.length]?.focus();
  };

  return (
    <div
      onClick={close}
      onKeyDown={e => {
        if (e.key === 'Escape') {
          if (statusFor) { setStatusFor(null); setCursor(0); }
          else close();
          return;
        }
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setCursor(c => Math.min(c + 1, listLength - 1));
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setCursor(c => Math.max(c - 1, 0));
        }
        if (statusFor) {
          if (e.key === 'Enter' && STATUS_OPTIONS[clamped]) {
            e.preventDefault();
            void applyStatus(statusFor, STATUS_OPTIONS[clamped]);
          }
          if (e.key === 'Backspace' && query === '') {
            e.preventDefault();
            setStatusFor(null);
            setCursor(0);
          }
          if (e.key === 'Tab') trapFocus(e);
          return;
        }
        if (e.key === 'Tab') {
          const cmd = results[clamped];
          if (cmd?.kind === 'novel') {
            e.preventDefault();
            setStatusFor(cmd.novel);
            setQuery('');
            setCursor(0);
          } else {
            trapFocus(e);
          }
        }
        if (e.key === 'Enter' && results[clamped]) {
          e.preventDefault();
          run(results[clamped], e.shiftKey);
        }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c' && !window.getSelection()?.toString()) {
          const cmd = results[clamped];
          if (cmd?.kind === 'novel' && cmd.novel.latest_url) {
            e.preventDefault();
            void copyResumeLink(cmd.novel.latest_url, cmd.novel.latest_percent ?? 0);
            close();
          }
        }
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: 'rgba(0,0,0,0.55)',
        backdropFilter: 'blur(2px)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start',
        paddingTop: '14vh',
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onClick={e => e.stopPropagation()}
        className="glass animate-fade-in"
        style={{
          width: 'min(560px, 92vw)',
          borderRadius: 'var(--radius-xl)',
          border: '1px solid var(--color-accent-border)',
          background: 'var(--color-bg-raised)',
          boxShadow: '0 16px 48px rgba(0,0,0,0.6)',
          overflow: 'hidden',
        }}
      >
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => { setQuery(e.target.value); setCursor(0); }}
          placeholder={statusFor ? `Set status for “${statusFor.title}”…` : 'Search novels or jump to a page…'}
          aria-label="Command palette search"
          style={{
            width: '100%',
            background: 'transparent',
            border: 'none',
            borderBottom: '1px solid var(--color-border)',
            outline: 'none',
            padding: '14px 18px',
            color: 'var(--color-text)',
            fontSize: 'var(--text-base)',
            fontFamily: 'inherit',
          }}
        />

        <div style={{ maxHeight: '50vh', overflowY: 'auto', padding: 6 }}>
          {statusFor ? (
            STATUS_OPTIONS.map((s, i) => {
              const active = i === clamped;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => { void applyStatus(statusFor, s); }}
                  onMouseEnter={() => setCursor(i)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    width: '100%',
                    textAlign: 'left',
                    background: active ? 'var(--color-accent-glow)' : 'none',
                    border: 'none',
                    borderRadius: 'var(--radius-md)',
                    padding: '9px 12px',
                    cursor: 'pointer',
                    color: active ? 'var(--color-accent)' : 'var(--color-text)',
                    fontSize: 'var(--text-sm)',
                  }}
                >
                  <span aria-hidden="true" style={{ opacity: 0.6, flexShrink: 0 }}>◆</span>
                  <span style={{ flex: 1 }}>{s.charAt(0).toUpperCase() + s.slice(1)}</span>
                  {statusFor.status === s && (
                    <span className="text-faint" style={{ fontSize: 'var(--text-xs)' }}>current</span>
                  )}
                </button>
              );
            })
          ) : results.length === 0 ? (
            <p className="text-muted" style={{ fontSize: 'var(--text-sm)', padding: '16px 14px' }}>
              No matches.
            </p>
          ) : (
            results.map((cmd, i) => {
              const active = i === clamped;
              const key = cmd.kind === 'page' ? cmd.to : cmd.novel.novel_id;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => run(cmd, false)}
                  onMouseEnter={() => setCursor(i)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    width: '100%',
                    textAlign: 'left',
                    background: active ? 'var(--color-accent-glow)' : 'none',
                    border: 'none',
                    borderRadius: 'var(--radius-md)',
                    padding: '9px 12px',
                    cursor: 'pointer',
                    color: active ? 'var(--color-accent)' : 'var(--color-text)',
                    fontSize: 'var(--text-sm)',
                  }}
                >
                  <span aria-hidden="true" style={{ opacity: 0.6, flexShrink: 0 }}>
                    {cmd.kind === 'page' ? '→' : <BookOpenIcon size={12} />}
                  </span>
                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {cmd.label}
                  </span>
                  {cmd.kind === 'novel' && (
                    <span className="text-faint tabular" style={{ fontSize: 'var(--text-xs)', flexShrink: 0 }}>
                      {cmd.novel.latest_chapter != null && `Ch. ${cmd.novel.latest_chapter}`}
                      {' · '}
                      {cmd.novel.status}
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>

        <div
          className="text-faint"
          style={{
            display: 'flex',
            gap: 14,
            padding: '8px 14px',
            borderTop: '1px solid var(--color-border)',
            fontSize: 'var(--text-xs)',
          }}
        >
          {statusFor ? (
            <>
              <span>↑↓ navigate</span>
              <span>↵ set status</span>
              <span style={{ marginLeft: 'auto' }}>esc back</span>
            </>
          ) : (
            <>
              <span>↑↓ navigate</span>
              <span>↵ open</span>
              <span>⇧↵ resume</span>
              <span>⇥ status</span>
              <span>^C copy link</span>
              <span style={{ marginLeft: 'auto' }}>esc close</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
