import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useSWR from 'swr';
import { fetchNovels, resumeUrl, copyResumeLink } from '../api/client.js';
import { rankItems } from '../lib/fuzzy.js';
import type { Novel } from '../types/index.js';

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

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

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

  const clamped = Math.min(cursor, Math.max(0, results.length - 1));

  return (
    <div
      onClick={close}
      onKeyDown={e => {
        if (e.key === 'Escape') close();
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setCursor(c => Math.min(c + 1, results.length - 1));
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setCursor(c => Math.max(c - 1, 0));
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
        role="dialog"
        aria-label="Command palette"
        onClick={e => e.stopPropagation()}
        className="glass animate-fade-in"
        style={{
          width: 'min(560px, 92vw)',
          borderRadius: 'var(--radius-xl)',
          border: '1px solid var(--color-gold-border)',
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
          placeholder="Search novels or jump to a page…"
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
          {results.length === 0 ? (
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
                    background: active ? 'var(--color-gold-glow)' : 'none',
                    border: 'none',
                    borderRadius: 'var(--radius-md)',
                    padding: '9px 12px',
                    cursor: 'pointer',
                    color: active ? 'var(--color-gold)' : 'var(--color-text)',
                    fontSize: 'var(--text-sm)',
                  }}
                >
                  <span aria-hidden="true" style={{ opacity: 0.6, flexShrink: 0 }}>
                    {cmd.kind === 'page' ? '→' : '📖'}
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
          <span>↑↓ navigate</span>
          <span>↵ open</span>
          <span>⇧↵ resume on site</span>
          <span>^C copy resume link</span>
          <span style={{ marginLeft: 'auto' }}>esc close</span>
        </div>
      </div>
    </div>
  );
}
