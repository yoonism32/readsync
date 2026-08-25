import { useState } from 'react';
import useSWR from 'swr';
import { swrFetcher } from '../api/client.js';
import type { Novel } from '../types/index.js';

interface ChaptersRead {
  read_through: number;
  chapters: number[];
}

/** Chapters shown as cells; larger novels window to the most recent ones. */
const MAX_CELLS = 300;
/** Skipped-range summary caps out to keep the line scannable. */
const MAX_GAP_RANGES = 5;

function compressRanges(nums: number[]): string[] {
  const out: string[] = [];
  let start = -1;
  let prev = -1;
  for (const n of nums) {
    if (start === -1) { start = n; prev = n; continue; }
    if (n === prev + 1) { prev = n; continue; }
    out.push(start === prev ? `${start}` : `${start}–${prev}`);
    start = n; prev = n;
  }
  if (start !== -1) out.push(start === prev ? `${start}` : `${start}–${prev}`);
  return out;
}

interface Props {
  novel: Novel;
}

export function ChapterMap({ novel }: Props) {
  const { data } = useSWR<ChaptersRead>(
    `/novels/${encodeURIComponent(novel.novel_id)}/chapters-read`,
    swrFetcher,
    { revalidateOnFocus: false }
  );

  const [pageOffset, setPageOffset] = useState(0);
  const [prevNovelId, setPrevNovelId] = useState(novel.novel_id);
  if (novel.novel_id !== prevNovelId) {
    setPrevNovelId(novel.novel_id);
    setPageOffset(0);
  }

  if (!data) return null;

  const readSet = new Set(data.chapters);
  const current = novel.latest_chapter ?? 0;
  const total = Math.max(
    novel.latest_chapter_num ?? 0,
    current,
    data.chapters.length ? data.chapters[data.chapters.length - 1] : 0
  );
  if (total === 0) return null;

  const windowEnd = Math.max(1, total - pageOffset * MAX_CELLS);
  const windowStart = Math.max(1, windowEnd - MAX_CELLS + 1);
  const cells: number[] = [];
  for (let c = windowStart; c <= windowEnd; c++) cells.push(c);

  const hasPager = total > MAX_CELLS;
  const canGoNewer = pageOffset > 0;
  const canGoOlder = windowStart > 1;

  // chapters below the frontier that were never visited (skipped or synced-over)
  const skipped: number[] = [];
  for (let c = 1; c <= current; c++) if (!readSet.has(c)) skipped.push(c);
  const skippedRanges = compressRanges(skipped);

  return (
    <div className="panel" style={{ borderRadius: 'var(--radius-xl)', padding: 20, marginTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
        <h2 style={{ fontSize: 'var(--text-md, var(--text-sm))', fontWeight: 600 }}>Chapters</h2>
        <span className="text-muted tabular" style={{ fontSize: 'var(--text-xs)' }}>
          {data.chapters.length} of {total} read
          {data.read_through > 1 && ` · read-through #${data.read_through}`}
        </span>
      </div>

      {skippedRanges.length > 0 && (
        <p className="text-faint" style={{ fontSize: 'var(--text-xs)', marginBottom: 10 }}>
          Never opened: {skippedRanges.slice(0, MAX_GAP_RANGES).join(', ')}
          {skippedRanges.length > MAX_GAP_RANGES && ` +${skippedRanges.length - MAX_GAP_RANGES} more`}
        </p>
      )}

      {hasPager && (
        <p className="text-faint" style={{ fontSize: 'var(--text-xs)', marginBottom: 8 }}>
          Showing {windowStart}–{windowEnd}
        </p>
      )}

      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <div
          style={{
            flex: 1,
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(12px, 1fr))',
            gap: 3,
          }}
        >
          {cells.map(c => {
            const isCurrent = c === current;
            const isRead = readSet.has(c);
            return (
              <div
                key={c}
                title={`Ch. ${c}${isCurrent ? ' — current' : isRead ? ' — read' : ' — unread'}`}
                style={{
                  height: 12,
                  borderRadius: 2,
                  background: isCurrent
                    ? 'var(--color-accent-bright)'
                    : isRead
                      ? 'var(--color-accent-dim)'
                      : 'rgba(255,255,255,0.06)',
                  outline: isCurrent ? '1px solid var(--color-accent)' : 'none',
                  outlineOffset: 1,
                }}
              />
            );
          })}
        </div>

        {hasPager && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <button
              className="btn-ghost"
              disabled={!canGoNewer}
              onClick={() => setPageOffset(p => p - 1)}
              style={{ width: 22, height: 22, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, lineHeight: 1 }}
              aria-label="Newer chapters"
              title="Newer chapters"
            >
              ▲
            </button>
            <button
              className="btn-ghost"
              disabled={!canGoOlder}
              onClick={() => setPageOffset(p => p + 1)}
              style={{ width: 22, height: 22, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, lineHeight: 1 }}
              aria-label="Older chapters"
              title="Older chapters"
            >
              ▼
            </button>
          </div>
        )}
      </div>

      <div className="text-faint" style={{ display: 'flex', gap: 14, marginTop: 10, fontSize: 'var(--text-xs)' }}>
        <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: 'var(--color-accent-dim)', marginRight: 5, verticalAlign: 'middle' }} />Read</span>
        <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: 'var(--color-accent-bright)', marginRight: 5, verticalAlign: 'middle' }} />Current</span>
        <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: 'rgba(255,255,255,0.06)', marginRight: 5, verticalAlign: 'middle' }} />Unread</span>
      </div>
    </div>
  );
}
