import { useState } from 'react';
import { useSWRConfig } from 'swr';
import { novels as novelsApi } from '../api/client.js';
import { RatingStars } from './RatingStars.js';
import type { Novel } from '../types/index.js';

interface RateNovelProps {
  novel: Novel;
}

export function RateNovel({ novel }: RateNovelProps) {
  const { mutate } = useSWRConfig();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(novel.rating);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openEditor = () => {
    setPending(novel.rating);
    setError(null);
    setOpen(true);
  };

  const save = async (rating: number) => {
    setPending(rating);
    setBusy(true);
    setError(null);
    try {
      await novelsApi.setRating(novel.novel_id, rating);
      await mutate('/novels');
      setOpen(false);
    } catch {
      setError('Failed to save rating');
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
          color: novel.rating > 0 ? 'var(--color-gold)' : 'var(--color-text-faint)',
          fontSize: 'var(--text-xs)',
          cursor: 'pointer',
          textDecoration: 'underline',
          textUnderlineOffset: 3,
        }}
      >
        {novel.rating > 0 ? `★ ${novel.rating.toFixed(1)}` : 'Rate'}
      </button>
    );
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <RatingStars value={pending} onChange={rating => { void save(rating); }} size={18} readOnly={busy} />
      <button type="button" className="btn-ghost" style={{ padding: '4px 10px', fontSize: 'var(--text-xs)' }} onClick={() => setOpen(false)} disabled={busy}>
        Close
      </button>
      {error && <span style={{ color: 'var(--color-danger)', fontSize: 'var(--text-xs)' }}>{error}</span>}
    </span>
  );
}
