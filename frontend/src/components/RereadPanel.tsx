import { useState } from 'react';
import { useSWRConfig } from 'swr';
import { novels as novelsApi } from '../api/client.js';
import type { Novel, ReadThroughEntry } from '../types/index.js';

interface RereadPanelProps {
  novel: Novel;
}

const shortDate = (iso: string | null | undefined): string =>
  iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '?';

function HistoryRow({ entry }: { entry: ReadThroughEntry }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'baseline',
        gap: 10,
        padding: '8px 0',
        borderBottom: '1px solid var(--color-border)',
        fontSize: 'var(--text-sm)',
      }}
    >
      <span style={{ color: 'var(--color-gold)', fontWeight: 600, flexShrink: 0 }}>#{entry.read_through}</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        reached ch. {entry.max_chapter}
        <span className="text-muted"> · {Math.round(entry.max_percent)}%</span>
      </span>
      <span className="text-faint" style={{ fontSize: 'var(--text-xs)', flexShrink: 0 }}>
        {shortDate(entry.started_at)} → {shortDate(entry.completed_at)}
      </span>
    </div>
  );
}

export function RereadPanel({ novel }: RereadPanelProps) {
  const { mutate } = useSWRConfig();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const history = [...(novel.read_history ?? [])].sort((a, b) => b.read_through - a.read_through);

  const startReread = async () => {
    setBusy(true);
    setError(null);
    try {
      await novelsApi.startReread(novel.novel_id);
      setConfirming(false);
      // Read-through number, progress, and chapter map all change.
      await Promise.all([
        mutate('/novels'),
        mutate(`/novels/${encodeURIComponent(novel.novel_id)}/chapters-read`),
      ]);
    } catch {
      setError('Failed to start re-read');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="glass" style={{ borderRadius: 'var(--radius-xl)', padding: 20, marginTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
        <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 600 }}>Read-throughs</h2>
        <span
          style={{
            fontSize: 'var(--text-xs)',
            color: 'var(--color-gold)',
            background: 'var(--color-gold-glow)',
            border: '1px solid var(--color-gold-border)',
            borderRadius: 'var(--radius-full)',
            padding: '1px 8px',
          }}
        >
          currently #{novel.current_read_through ?? 1}
        </span>
        <span style={{ flex: 1 }} />
        {confirming ? (
          <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
            <span className="text-muted" style={{ fontSize: 'var(--text-xs)' }}>
              Archives current progress and starts from scratch — sure?
            </span>
            <button type="button" className="btn-ghost" onClick={() => setConfirming(false)} disabled={busy}>
              Cancel
            </button>
            <button type="button" className="btn-gold" onClick={startReread} disabled={busy}>
              Start re-read
            </button>
          </span>
        ) : (
          <button type="button" className="btn-ghost" onClick={() => setConfirming(true)}>
            Start re-read
          </button>
        )}
      </div>

      <p className="text-faint" style={{ fontSize: 'var(--text-xs)', marginBottom: 10 }}>
        Started {shortDate(novel.started_at)}
        {novel.latest_chapter != null && ` · at ch. ${novel.latest_chapter}`}
      </p>

      {history.length === 0 ? (
        <p className="text-faint" style={{ fontSize: 'var(--text-sm)' }}>
          First read-through — past runs will be archived here.
        </p>
      ) : (
        <div>
          {history.map(h => (
            <HistoryRow key={h.read_through} entry={h} />
          ))}
        </div>
      )}
      {error && <p style={{ color: 'var(--color-danger)', fontSize: 'var(--text-xs)', marginTop: 8 }}>{error}</p>}
    </div>
  );
}
