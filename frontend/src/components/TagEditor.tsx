import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { categories as categoriesApi } from '../api/client.js';
import type { CategoryAssignment } from '../types/index.js';

interface TagEditorProps {
  novelId: string;
}

export function TagEditor({ novelId }: TagEditorProps) {
  const { data, mutate } = useSWR<CategoryAssignment[]>(
    'categories-all',
    () => categoriesApi.all(),
    { revalidateOnFocus: false },
  );
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const assignments = data ?? [];
  const myTags = useMemo(
    () => assignments.filter(a => a.novel_id === novelId).map(a => a.category),
    [assignments, novelId],
  );
  const suggestions = useMemo(() => {
    const all = new Set(assignments.map(a => a.category));
    for (const t of myTags) all.delete(t);
    return [...all].sort();
  }, [assignments, myTags]);

  const add = async (raw: string) => {
    const tag = raw.trim().toLowerCase();
    if (!tag || myTags.includes(tag)) {
      setInput('');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await categoriesApi.add(novelId, tag);
      setInput('');
      await mutate();
    } catch {
      setError('Failed to add tag');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (tag: string) => {
    setBusy(true);
    setError(null);
    try {
      await categoriesApi.remove(novelId, tag);
      await mutate();
    } catch {
      setError('Failed to remove tag');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 12 }}>
      {myTags.map(tag => (
        <span
          key={tag}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 'var(--text-xs)',
            color: 'var(--color-accent)',
            background: 'var(--color-accent-glow)',
            border: '1px solid var(--color-accent-border)',
            borderRadius: 'var(--radius-full)',
            padding: '2px 4px 2px 10px',
          }}
        >
          {tag}
          <button
            type="button"
            onClick={() => remove(tag)}
            disabled={busy}
            aria-label={`Remove tag ${tag}`}
            style={{
              background: 'none',
              border: 'none',
              color: 'inherit',
              cursor: 'pointer',
              padding: '0 4px',
              fontSize: 'inherit',
              lineHeight: 1,
              opacity: 0.7,
            }}
          >
            ×
          </button>
        </span>
      ))}

      <input
        type="text"
        list="tag-suggestions"
        placeholder="+ tag"
        value={input}
        maxLength={40}
        onChange={e => setInput(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') {
            e.preventDefault();
            void add(input);
          }
        }}
        onBlur={() => {
          if (input.trim()) void add(input);
        }}
        disabled={busy}
        className="input"
        style={{
          background: 'transparent',
          border: '1px dashed var(--color-border)',
          borderRadius: 'var(--radius-full)',
          color: 'var(--color-text-muted)',
          fontSize: 'var(--text-xs)',
          padding: '2px 10px',
          width: 90,
          outline: 'none',
        }}
      />
      <datalist id="tag-suggestions">
        {suggestions.map(t => (
          <option key={t} value={t} />
        ))}
      </datalist>
      {error && <span style={{ color: 'var(--color-danger)', fontSize: 'var(--text-xs)' }}>{error}</span>}
    </div>
  );
}
