import { useState } from 'react';
import { useSWRConfig } from 'swr';
import { novels as novelsApi } from '../api/client.js';
import type { Novel } from '../types/index.js';

interface EditProgressProps {
  novel: Novel;
}

const inputStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-md)',
  color: 'var(--color-text)',
  fontSize: 'var(--text-sm)',
  padding: '5px 8px',
  width: 80,
  fontFamily: 'inherit',
};

/** Manual bookmark correction — writes straight through the max-progress
 *  policy via the progress-override endpoint. */
export function EditProgress({ novel }: EditProgressProps) {
  const { mutate } = useSWRConfig();
  const [open, setOpen] = useState(false);
  const [chapter, setChapter] = useState('');
  const [percent, setPercent] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openEditor = () => {
    setChapter(novel.latest_chapter != null ? String(novel.latest_chapter) : '');
    setPercent(novel.latest_percent != null ? String(Math.round(novel.latest_percent)) : '');
    setError(null);
    setOpen(true);
  };

  const save = async () => {
    const ch = Number(chapter);
    const pct = percent === '' ? 0 : Number(percent);
    if (!Number.isInteger(ch) || ch < 0 || pct < 0 || pct > 100) {
      setError('Chapter must be a whole number; percent 0–100.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await novelsApi.progressOverride(novel.novel_id, ch, pct);
      setOpen(false);
      await Promise.all([
        mutate('/novels'),
        mutate(`/novels/${encodeURIComponent(novel.novel_id)}/chapters-read`),
      ]);
    } catch {
      setError('Failed to update progress');
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={openEditor}
        style={{
          background: 'none',
          border: 'none',
          padding: 0,
          color: 'var(--color-text-faint)',
          fontSize: 'var(--text-xs)',
          cursor: 'pointer',
          textDecoration: 'underline',
          textUnderlineOffset: 3,
        }}
      >
        Edit progress
      </button>
    );
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      <label className="text-muted" style={{ fontSize: 'var(--text-xs)' }}>
        Ch.
        <input
          type="number"
          min={0}
          value={chapter}
          onChange={e => setChapter(e.target.value)}
          style={{ ...inputStyle, marginLeft: 4 }}
          autoFocus
        />
      </label>
      <label className="text-muted" style={{ fontSize: 'var(--text-xs)' }}>
        %
        <input
          type="number"
          min={0}
          max={100}
          value={percent}
          onChange={e => setPercent(e.target.value)}
          style={{ ...inputStyle, width: 60, marginLeft: 4 }}
        />
      </label>
      <button type="button" className="btn-gold" style={{ padding: '4px 10px', fontSize: 'var(--text-xs)' }} onClick={save} disabled={busy || !chapter}>
        Save
      </button>
      <button type="button" className="btn-ghost" style={{ padding: '4px 10px', fontSize: 'var(--text-xs)' }} onClick={() => setOpen(false)} disabled={busy}>
        Cancel
      </button>
      {error && <span style={{ color: 'var(--color-danger)', fontSize: 'var(--text-xs)' }}>{error}</span>}
    </span>
  );
}
