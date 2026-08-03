import { Link, useParams } from 'react-router-dom';
import useSWR from 'swr';
import { fetchNovels, formatTimestamp } from '../api/client.js';
import { ProgressBar } from '../components/ProgressBar.js';
import { StatusBadge } from '../components/StatusBadge.js';
import { Spinner } from '../components/Spinner.js';
import type { Novel } from '../types/index.js';

export function NovelPage() {
  const { novelId } = useParams<{ novelId: string }>();
  const { data: novelsData, isLoading } = useSWR<Novel[]>('/novels', fetchNovels);
  const novel = novelsData?.find(n => n.novel_id === novelId);

  if (isLoading) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}><Spinner size={32} /></div>;
  }

  if (!novel) {
    return (
      <div style={{ padding: '80px 0', textAlign: 'center' }}>
        <p className="text-muted">Novel not found.</p>
        <Link to="/mylist" style={{ color: 'var(--color-gold)', fontSize: 'var(--text-sm)', marginTop: 12, display: 'block' }}>
          ← Back to My List
        </Link>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <Link to="/mylist" className="text-muted" style={{ fontSize: 'var(--text-sm)', display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 20, textDecoration: 'none', transition: 'color 0.15s' }}
        onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-text)')}
        onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-text-muted)')}
      >
        ← My List
      </Link>

      <div className="glass" style={{ borderRadius: 'var(--radius-xl)', padding: 24, marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
          {/* Cover */}
          <div style={{ width: 80, height: 112, flexShrink: 0, borderRadius: 6, overflow: 'hidden', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--color-border)' }}>
            <img
              src={`/api/v1/covers/${encodeURIComponent(novel.novel_id)}`}
              alt=""
              width={80}
              height={112}
              loading="lazy"
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ fontSize: 'var(--text-xl)', marginBottom: 8 }}>{novel.title}</h1>
            {novel.author && <p className="text-muted" style={{ fontSize: 'var(--text-sm)', marginBottom: 8 }}>by {novel.author}</p>}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
              <StatusBadge status={novel.status} />
              {novel.genre && (
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', padding: '2px 8px', background: 'rgba(255,255,255,0.05)', borderRadius: 'var(--radius-full)', border: '1px solid var(--color-border)' }}>
                  {novel.genre}
                </span>
              )}
            </div>

            <ProgressBar percent={novel.latest_percent ?? 0} showLabel size="md" />

            <div className="text-muted" style={{ fontSize: 'var(--text-xs)', marginTop: 8, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {novel.latest_chapter != null && <span>Ch. {novel.latest_chapter}{novel.latest_chapter_num ? ` / ${novel.latest_chapter_num}` : ''}</span>}
              {novel.latest_read_at && <span>Last read {formatTimestamp(novel.latest_read_at)}</span>}
              {novel.started_at && <span>Started {new Date(novel.started_at).toLocaleDateString()}</span>}
            </div>
          </div>
        </div>
      </div>

      {novel.latest_url && (
        <a
          href={novel.latest_url}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            background: 'var(--color-gold)',
            color: '#080c12',
            borderRadius: 'var(--radius-md)',
            padding: '9px 16px',
            fontWeight: 600,
            fontSize: 'var(--text-sm)',
            textDecoration: 'none',
            transition: 'background 0.15s, transform 0.1s',
            touchAction: 'manipulation',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-gold-bright)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'var(--color-gold)')}
          onMouseDown={e => (e.currentTarget.style.transform = 'scale(0.97)')}
          onMouseUp={e => (e.currentTarget.style.transform = 'scale(1)')}
        >
          Continue Reading →
        </a>
      )}
    </div>
  );
}
