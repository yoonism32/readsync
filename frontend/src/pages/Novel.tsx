import { Link, useParams } from 'react-router-dom';
import useSWR from 'swr';
import toast from 'react-hot-toast';
import { fetchNovels, formatTimestamp, coverUrl, resumeUrl, novels as novelsApi } from '../api/client.js';
import { ProgressBar } from '../components/ProgressBar.js';
import { StatusBadge } from '../components/StatusBadge.js';
import { Spinner } from '../components/Spinner.js';
import { BehindBadge } from '../components/BehindBadge.js';
import { HiatusBadge } from '../components/HiatusBadge.js';
import { ChapterMap } from '../components/ChapterMap.js';
import { NotesPanel } from '../components/NotesPanel.js';
import { RereadPanel } from '../components/RereadPanel.js';
import { TagEditor } from '../components/TagEditor.js';
import { EditProgress } from '../components/EditProgress.js';
import { RateNovel } from '../components/RateNovel.js';
import { DeviceBadge } from '../components/DeviceBadge.js';
import { StarIcon, ExternalLinkIcon, CrownIcon } from '../components/Icon.js';
import type { Novel } from '../types/index.js';

export function NovelPage() {
  const { novelId } = useParams<{ novelId: string }>();
  const { data: novelsData, isLoading, mutate } = useSWR<Novel[]>('/novels', fetchNovels);
  const novel = novelsData?.find(n => n.novel_id === novelId);

  async function toggleFav() {
    if (!novel) return;
    try {
      await novelsApi.setFavorite(novel.novel_id, !novel.favorite);
      await mutate();
    } catch {
      toast.error('Failed to update favorite');
    }
  }

  if (isLoading) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}><Spinner size={32} /></div>;
  }

  if (!novel) {
    return (
      <div style={{ padding: '80px 0', textAlign: 'center' }}>
        <p className="text-muted">Novel not found.</p>
        <Link to="/mylist" style={{ color: 'var(--color-accent)', fontSize: 'var(--text-sm)', marginTop: 12, display: 'block' }}>
          ← Back to My List
        </Link>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <Link to="/mylist" className="muted-btn" style={{ fontSize: 'var(--text-sm)', display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 20, textDecoration: 'none' }}>
        ← My List
      </Link>

      <div className="panel" style={{ borderRadius: 'var(--radius-xl)', padding: 24, marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
          {/* Cover — the anchor of this page, so it is sized to carry the card
              rather than sit in its corner. Fluid between phone and desktop;
              aspect-ratio holds the 5:7 shape so nothing shifts as it loads. */}
          <div
            style={{
              width: 'clamp(104px, 20vw, 168px)',
              aspectRatio: '5 / 7',
              flexShrink: 0,
              borderRadius: 10,
              overflow: 'hidden',
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid var(--color-border)',
              boxShadow: '0 10px 28px rgba(0,0,0,0.45)',
            }}
          >
            <img
              src={coverUrl(novel.novel_id)}
              alt=""
              width={168}
              height={235}
              loading="lazy"
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
              <h1 style={{ fontSize: 'var(--text-xl)' }}>{novel.title}</h1>
              <button
                type="button"
                onClick={() => { void toggleFav(); }}
                aria-label={novel.favorite ? 'Remove from favorites' : 'Add to favorites'}
                style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: novel.favorite ? 'var(--color-warning)' : 'var(--color-text-faint)', lineHeight: 1 }}
              >
                <StarIcon size={16} filled={novel.favorite} />
              </button>
              <BehindBadge novel={novel} />
              <HiatusBadge novel={novel} />
            </div>
            {novel.author && <p className="text-muted" style={{ fontSize: 'var(--text-sm)', marginBottom: 8 }}>by {novel.author}</p>}
            <div style={{ marginBottom: 8 }}>
              <RateNovel novel={novel} />
            </div>
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
              {novel.completed_at && <span>Completed {new Date(novel.completed_at).toLocaleDateString()}</span>}
              <EditProgress novel={novel} />
            </div>

            <TagEditor novelId={novel.novel_id} />
          </div>
        </div>
      </div>

      {(novel.latest_url ?? novel.primary_url) && (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
          <a
            href={novel.latest_url ? resumeUrl(novel.latest_url, novel.latest_percent) : novel.primary_url!}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-accent"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '9px 16px',
              textDecoration: 'none',
            }}
          >
            {novel.latest_url ? 'Continue Reading →' : 'Open on NovelArrow →'}
          </a>

          <span style={{ flex: 1 }} />

          {/* Secondary actions stack down the right rather than widening into a
              second horizontal bar. Only shown when the primary button is
              "Continue Reading" — otherwise it already opens NovelArrow. */}
          {novel.latest_url && novel.primary_url && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
              <a
                href={novel.primary_url}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-ghost"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 7,
                  textDecoration: 'none',
                  whiteSpace: 'nowrap',
                }}
              >
                <ExternalLinkIcon size={14} />
                Open on NovelArrow
              </a>
            </div>
          )}
        </div>
      )}

      <ChapterMap novel={novel} />

      {novel.devices_reading.length > 1 && (
        <div className="panel" style={{ borderRadius: 'var(--radius-xl)', padding: 20, marginTop: 16 }}>
          <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 600, marginBottom: 12 }}>
            Device Progress
            <span className="text-muted" style={{ fontSize: 'var(--text-xs)', fontWeight: 400, marginLeft: 8 }}>
              {novel.devices_reading.length}
            </span>
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[...novel.devices_reading]
              .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
              .map(d => {
                const isLeader = novel.latest_device_id != null && d.device_id === novel.latest_device_id;
                const isBehind =
                  !isLeader &&
                  novel.latest_chapter != null &&
                  (d.chapter_num < novel.latest_chapter ||
                    (d.chapter_num === novel.latest_chapter &&
                      d.percent < (novel.latest_percent ?? 0) - 5));
                return (
                  <div
                    key={d.device_id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      fontSize: 'var(--text-sm)',
                      padding: '6px 10px',
                      borderRadius: 'var(--radius-md)',
                      background: isLeader ? 'var(--color-accent-glow)' : 'transparent',
                      border: isLeader ? '1px solid var(--color-accent-border)' : '1px solid transparent',
                    }}
                  >
                    {isLeader && (
                      <>
                        <CrownIcon size={13} style={{ color: 'var(--color-warning)', flexShrink: 0 }} />
                        <span className="sr-only">Furthest along</span>
                      </>
                    )}
                    <DeviceBadge label={d.device_label} />
                    <span className="tabular" style={{ color: isBehind ? 'var(--color-text-faint)' : 'var(--color-text)' }}>
                      Ch. {d.chapter_num} · {Math.round(d.percent)}%
                    </span>
                    <span style={{ flex: 1 }} />
                    <span className="text-faint" style={{ fontSize: 'var(--text-xs)' }}>{formatTimestamp(d.created_at)}</span>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      <RereadPanel novel={novel} />
      <NotesPanel novelId={novel.novel_id} />
    </div>
  );
}
