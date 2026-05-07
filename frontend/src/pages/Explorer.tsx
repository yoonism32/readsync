import { useState } from 'react';
import { Link } from 'react-router-dom';
import useSWR from 'swr';
import { swrFetcher, formatTimestamp } from '../api/client.js';
import { ProgressBar } from '../components/ProgressBar.js';
import { Spinner } from '../components/Spinner.js';
import type { Novel } from '../types/index.js';

export function Explorer() {
  const [query, setQuery] = useState('');

  const { data, isLoading } = useSWR<{ novels: Novel[] }>('/novels', swrFetcher, { revalidateOnFocus: false });

  const results = (data?.novels ?? []).filter(n => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (
      n.title.toLowerCase().includes(q) ||
      (n.author ?? '').toLowerCase().includes(q) ||
      (n.genre ?? '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="animate-fade-in">
      <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, marginBottom: 24 }}>Explorer</h1>

      <input
        type="search"
        placeholder="Search by title, author, or genre…"
        autoComplete="off"
        value={query}
        onChange={e => setQuery(e.target.value)}
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
          transition: 'border-color 0.15s',
        }}
        onFocus={e => (e.target.style.borderColor = 'var(--color-gold)')}
        onBlur={e => (e.target.style.borderColor = 'var(--color-border)')}
      />

      {isLoading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spinner size={28} /></div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: 10,
          }}
        >
          {results.map((n, i) => (
            <Link
              key={n.novel_id}
              to={`/novel/${encodeURIComponent(n.novel_id)}`}
              className="glass animate-fade-in"
              style={{
                animationDelay: `${Math.min(i * 20, 200)}ms`,
                borderRadius: 'var(--radius-lg)',
                padding: '14px 16px',
                display: 'block',
                transition: 'border-color 0.15s',
                textDecoration: 'none',
              }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--color-border-gold)')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--color-border)')}
            >
              <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)', marginBottom: 4 }} className="line-clamp-2">
                {n.title}
              </div>
              {n.author && (
                <div className="text-muted" style={{ fontSize: 'var(--text-xs)', marginBottom: 8 }}>
                  {n.author}
                </div>
              )}
              <ProgressBar percent={n.latest_percent ?? 0} showLabel size="sm" />
              {n.latest_read_at && (
                <div className="text-faint" style={{ fontSize: 'var(--text-xs)', marginTop: 6 }}>
                  {formatTimestamp(n.latest_read_at)}
                </div>
              )}
            </Link>
          ))}
          {results.length === 0 && (
            <p className="text-muted" style={{ fontSize: 'var(--text-sm)', gridColumn: '1 / -1' }}>
              {query ? `No results for "${query}"` : 'No novels found.'}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
