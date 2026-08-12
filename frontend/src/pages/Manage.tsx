import { useState } from 'react';
import useSWR from 'swr';
import toast from 'react-hot-toast';
import { ApiError, fetchNovels, novels as novelsApi } from '../api/client.js';
import { StatusBadge } from '../components/StatusBadge.js';
import { Spinner } from '../components/Spinner.js';
import type { Novel, NovelStatus } from '../types/index.js';

const STATUSES = ['reading', 'completed', 'on-hold', 'dropped', 'plan-to-read'] as const;

/** Keep the server's own words — a bare "Failed to…" leaves nothing to debug from. */
function errorDetail(error: unknown): string {
  if (error instanceof ApiError) return `${error.status} — ${error.message}`;
  if (error instanceof Error) return error.message;
  return 'unknown error';
}

export function Manage() {
  // Polls so progress synced from other devices/tabs shows up without a
  // manual page reload — see docs/ARCHITECTURE.md. 3 minutes (matching
  // MyList): an open tab polls forever, and every full-library refetch
  // counts as Supabase DB egress.
  const { data, isLoading, mutate } = useSWR<Novel[]>('/novels', fetchNovels, {
    refreshInterval: 3 * 60_000,
  });
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const novels = (data ?? []).filter(n => {
    if (!query.trim()) return true;
    return n.title.toLowerCase().includes(query.toLowerCase());
  });

  async function handleStatusChange(novelId: string, newStatus: string) {
    setBusy(novelId);
    try {
      await novelsApi.setStatus(novelId, newStatus as NovelStatus);
      await mutate();
      // Silent success: the row's status badge updates in place.
    } catch (error) {
      toast.error(`Failed to update status: ${errorDetail(error)}`);
    } finally {
      setBusy(null);
    }
  }

  async function handleDelete(novelId: string) {
    setBusy(novelId);
    setConfirmDelete(null);
    try {
      await novelsApi.delete(novelId);
      await mutate();
      toast.success('Novel removed');
    } catch (error) {
      toast.error(`Failed to remove novel: ${errorDetail(error)}`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="animate-fade-in">
      <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, marginBottom: 24 }}>Manage</h1>

      <input
        type="search"
        placeholder="Filter by title…"
        autoComplete="off"
        value={query}
        onChange={e => setQuery(e.target.value)}
        className="input"
        style={{
          width: '100%',
          background: 'var(--color-bg-input)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-lg)',
          padding: '11px 16px',
          color: 'var(--color-text)',
          fontSize: 'var(--text-base)',
          outline: 'none',
          marginBottom: 20,
        }}
      />

      {isLoading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spinner size={28} /></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {novels.map(n => (
            <div
              key={n.novel_id}
              className="panel"
              style={{
                borderRadius: 'var(--radius-lg)',
                padding: '12px 16px',
                display: 'flex',
                alignItems: 'center',
                // The controls can't shrink below their content, so at 320px
                // they pushed past the viewport. Let them drop to a second row.
                flexWrap: 'wrap',
                gap: 12,
                opacity: busy === n.novel_id ? 0.6 : 1,
                transition: 'opacity 0.15s',
              }}
            >
              {/* A 0% basis let this collapse to nothing rather than pushing
                  the controls onto their own row — the title read as "I…". */}
              <div style={{ flex: '1 1 160px', minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)', marginBottom: 4 }} className="line-clamp-1">
                  {n.title}
                </div>
                {n.author && (
                  <div className="text-muted line-clamp-1" style={{ fontSize: 'var(--text-xs)' }}>{n.author}</div>
                )}
              </div>

              {/* Status selector */}
              <select
                aria-label={`Reading status for ${n.title}`}
                value={n.status ?? ''}
                disabled={busy === n.novel_id}
                onChange={e => { void handleStatusChange(n.novel_id, e.target.value); }}
                style={{
                  background: 'var(--color-bg-input)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--color-text)',
                  fontSize: 'var(--text-xs)',
                  padding: '4px 8px',
                  cursor: 'pointer',
                  outline: 'none',
                }}
              >
                {STATUSES.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>

              <StatusBadge status={n.status} />

              {/* Delete button / confirm */}
              {confirmDelete === n.novel_id ? (
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    onClick={() => { void handleDelete(n.novel_id); }}
                    disabled={busy === n.novel_id}
                    style={{
                      background: 'var(--color-danger)',
                      color: 'var(--color-on-accent)',
                      border: 'none',
                      borderRadius: 'var(--radius-sm)',
                      padding: '3px 10px',
                      fontSize: 'var(--text-xs)',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Confirm
                  </button>
                  <button
                    onClick={() => setConfirmDelete(null)}
                    style={{
                      background: 'none',
                      border: '1px solid var(--color-border)',
                      borderRadius: 'var(--radius-sm)',
                      padding: '3px 10px',
                      color: 'var(--color-text-muted)',
                      fontSize: 'var(--text-xs)',
                      cursor: 'pointer',
                    }}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmDelete(n.novel_id)}
                  disabled={busy === n.novel_id}
                  aria-label={`Remove ${n.title}`}
                  style={{
                    background: 'none',
                    border: '1px solid var(--color-danger-border)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '3px 8px',
                    color: 'var(--color-danger)',
                    fontSize: 'var(--text-xs)',
                    cursor: 'pointer',
                    touchAction: 'manipulation',
                  }}
                >
                  Remove
                </button>
              )}
            </div>
          ))}
          {novels.length === 0 && (
            <p className="text-muted" style={{ fontSize: 'var(--text-sm)' }}>
              {query ? `No results for "${query}"` : 'No novels found.'}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
