import type { PoolClient } from 'pg';
import {
  DECIMAL_RADIX,
  DEVICE_BEHIND_THRESHOLD_PERCENT,
  MS_PER_DAY,
  MS_PER_HOUR,
  MS_PER_MINUTE,
  MS_PER_SECOND,
} from '../config.js';
import type {
  ChapterInfo,
  LatestStates,
  ProgressState,
} from '../types/index.js';

// NovelBin used /b/<slug>; NovelArrow uses /novel/<slug> and /chapter/<slug>/...
// Slugs are identical across both sites, so both normalize to the same legacy
// "novelbin:" ID to preserve existing reading history.
const NOVEL_SLUG_PATTERN = /\/(?:b|novel|chapter)\/([^/]+)/;

export function normalizeNovelId(url: string): string | null {
  const match = url.match(NOVEL_SLUG_PATTERN);
  return match ? `novelbin:${match[1].toLowerCase()}` : null;
}

export function extractNovelTitle(url: string): string {
  const match = url.match(NOVEL_SLUG_PATTERN);
  if (!match) return 'Unknown Novel';
  return match[1].replace(/-/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
}

/**
 * Derive the novel main-page URL from any novel/chapter URL on a supported site.
 * NovelArrow: https://novelarrow.com/chapter/<slug>/chapter-N-title → https://novelarrow.com/novel/<slug>
 * NovelBin:   https://novelbin.com/b/<slug>/chapter-N → https://novelbin.com/b/<slug>
 */
export function deriveNovelMainUrl(url: string): string {
  const arrowChapter = url.match(/^(https?:\/\/[^/]+)\/chapter\/([^/]+)/);
  if (arrowChapter) return `${arrowChapter[1]}/novel/${arrowChapter[2]}`;
  return url.replace(/\/c*chapter-?\d+.*$/, '');
}

const DEAD_DOMAIN_PATTERN = /^https?:\/\/(www\.)?novelbin\.(com|me|net|org)\//i;

/**
 * Historic progress/bookmark URLs may point at dead novelbin domains.
 * NovelArrow chapter URLs require a title slug we can't reconstruct from a
 * chapter number, so the best stable target is the novel's NovelArrow page
 * (derivable from the ID, since slugs are identical across both sites).
 * Progress URLs self-heal to real deep links as chapters are read on the
 * new site.
 */
export function healDeadSiteUrl(
  url: string | null | undefined,
  novelId: string,
): string | null {
  if (!url) return null;
  if (!DEAD_DOMAIN_PATTERN.test(url)) return url;
  const slug = novelId.replace(/^novelbin:/, '');
  return `https://novelarrow.com/novel/${slug}`;
}

export function parseChapterFromUrl(url: string): ChapterInfo | null {
  const m = url.match(/\/(c*chapter)-(\d+)(?:-\d+)?/i);
  if (!m) return null;
  return { token: m[1], num: parseInt(m[2], DECIMAL_RADIX) };
}

export function detectDeviceType(
  userAgent: string | undefined,
): 'mobile' | 'desktop' {
  if (!userAgent) return 'desktop';
  return /ipad|iphone|ipod|android/i.test(userAgent) ? 'mobile' : 'desktop';
}

export function parseTimeAgo(str: string | undefined): Date | null {
  if (!str) return null;
  let s = str.toLowerCase().trim();

  if (/just now|a few (seconds|secs) ago/i.test(s)) return new Date();

  s = s.replace(/\ban?\s+/i, '1 ');
  const match = s.match(
    /(\d+)\s*(second|sec|minute|min|hour|day|week|month|year)s?\s*ago/i,
  );
  if (!match) return null;

  const val = parseInt(match[1], DECIMAL_RADIX);
  const unit = match[2].toLowerCase();

  const ms: Record<string, number> = {
    second: MS_PER_SECOND,
    sec: MS_PER_SECOND,
    minute: MS_PER_MINUTE,
    min: MS_PER_MINUTE,
    hour: MS_PER_HOUR,
    day: MS_PER_DAY,
    week: MS_PER_DAY * 7,
    month: MS_PER_DAY * 30,
    year: MS_PER_DAY * 365,
  };

  if (!ms[unit]) return null;
  return new Date(Date.now() - val * ms[unit]);
}

export async function getLatestStates(
  client: PoolClient,
  userId: string,
  novelId: string,
  readThroughNum: number | null = null,
): Promise<LatestStates> {
  let rtNum = readThroughNum;
  if (rtNum == null) {
    const meta = await client.query<{ current_read_through: number }>(
      'SELECT current_read_through FROM user_novel_meta WHERE user_id = $1 AND novel_id = $2',
      [userId, novelId],
    );
    rtNum = meta.rows.length > 0 ? meta.rows[0].current_read_through : 1;
  }

  const globalResult = await client.query(
    `
    SELECT p.*, d.device_label, d.last_seen AS device_last_seen
    FROM progress_snapshots p
    JOIN devices d ON p.device_id = d.id
    WHERE p.user_id = $1 AND p.novel_id = $2 AND d.active = TRUE AND p.read_through_num = $3
    ORDER BY p.chapter_num DESC, p.percent DESC, p.created_at DESC
    LIMIT 1
  `,
    [userId, novelId, rtNum],
  );

  const deviceResult = await client.query(
    `
    SELECT DISTINCT ON (p.device_id) p.*, d.device_label
    FROM progress_snapshots p
    JOIN devices d ON p.device_id = d.id
    WHERE p.user_id = $1 AND p.novel_id = $2 AND d.active = TRUE AND p.read_through_num = $3
    ORDER BY p.device_id, p.created_at DESC
  `,
    [userId, novelId, rtNum],
  );

  const latest_global: ProgressState | null =
    globalResult.rows.length > 0
      ? {
          chapter_num: globalResult.rows[0].chapter_num,
          chapter_token: globalResult.rows[0].chapter_token,
          percent: parseFloat(globalResult.rows[0].percent),
          device_id: globalResult.rows[0].device_id,
          device_label: globalResult.rows[0].device_label,
          url: healDeadSiteUrl(globalResult.rows[0].url, novelId),
          ts: globalResult.rows[0].created_at,
        }
      : null;

  let latest_per_device: Record<string, Omit<ProgressState, 'device_id'>> = {};
  for (const row of deviceResult.rows) {
    latest_per_device[row.device_id] = {
      chapter_num: row.chapter_num,
      chapter_token: row.chapter_token,
      percent: parseFloat(row.percent),
      device_label: row.device_label,
      url: healDeadSiteUrl(row.url, novelId),
      ts: row.created_at,
    };
  }

  // Drop stale devices that are far behind the global leader
  if (latest_global) {
    const cleaned: typeof latest_per_device = {};
    const globalChapter = Number(latest_global.chapter_num) || 0;
    const globalPercent = Number(latest_global.percent) || 0;
    const leaderId = latest_global.device_id;

    for (const [id, d] of Object.entries(latest_per_device)) {
      if (id === leaderId) {
        cleaned[id] = d;
        continue;
      }
      const devChapter = Number(d.chapter_num) || 0;
      const devPercent = Number(d.percent) || 0;
      if (devChapter < globalChapter) continue;
      if (
        devChapter === globalChapter &&
        devPercent < globalPercent - DEVICE_BEHIND_THRESHOLD_PERCENT
      )
        continue;
      cleaned[id] = d;
    }
    latest_per_device = cleaned;
  }

  return { latest_global, latest_per_device };
}
