import type { NovelInfo } from './types/index.js';

/* Pure HTML/text parsing utilities — no db/browser imports so they can be
 * unit-tested in isolation (see __tests__/regression/novelParsing.test.ts). */

export function parseTimeAgo(str: string | undefined): Date | null {
  if (!str) return null;
  const s = str.toLowerCase().trim();
  const now = new Date();

  if (/just now|a few (seconds|secs) ago/i.test(s)) return now;

  const match = s.match(
    /(\d+)\s*(second|sec|minute|min|hour|day|week|month|year)s?\s*ago/i,
  );
  if (!match) return null;

  const val = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();

  const ms: Record<string, number> = {
    second: 1_000,
    sec: 1_000,
    minute: 60_000,
    min: 60_000,
    hour: 3_600_000,
    day: 86_400_000,
    week: 604_800_000,
    month: 2_592_000_000,
    year: 31_536_000_000,
  };

  if (!ms[unit]) return null;
  return new Date(now.getTime() - val * ms[unit]);
}

/**
 * Given a novel or chapter page URL, derive the novel's main/base page URL.
 *
 * userscript/src/services/ChapterDetector.ts has its own, more thorough
 * version of this same derivation (extra NovelBin number-prefix fallback
 * and a final slug-based fallback) for the browser/DOM scraping context —
 * the two can't share a module without new cross-package build tooling, so
 * keep them in sync by hand. See the parity test in
 * __tests__/regression/novelBaseUrlDerivation.test.ts, which documents
 * where the two currently agree and where they diverge (this version does
 * not handle NovelBin's /slug/31-the-beginning number-prefix chapter URLs —
 * only NovelArrow's /chapter/<slug>/chapter-N and the chapter-N suffix
 * style are stripped here).
 */
export function deriveNovelBaseUrl(novelUrl: string): string {
  const arrowChapter = novelUrl.match(/^(https?:\/\/[^/]+)\/chapter\/([^/]+)/);
  return arrowChapter
    ? `${arrowChapter[1]}/novel/${arrowChapter[2]}`
    : novelUrl.replace(/\/c*chapter-?\d+.*$/, '');
}

export function parseNovelInfoFromHTML(
  html: string,
  _novelUrl: string,
): NovelInfo {
  try {
    const result: NovelInfo = {
      chapter: null,
      genres: [],
      author: null,
      site_latest_chapter_time_raw: null,
      site_latest_chapter_time: null,
      synopsis: null,
    };

    // 1) Best source: og:novel:latest_chapter_name meta — NovelArrow uses
    // name=, NovelBin used property=. Content: "Chapter 3118 Dying City".
    const metaLast = html.match(
      /<meta[^>]+(?:property|name)=["']og:novel:latest_chapter_name["'][^>]+content=["']([^"']*)["']/i,
    );
    const metaLastParsed = metaLast?.[1].match(
      /[^0-9]*([0-9]+)\s*[-:]?\s*(.*)/,
    );
    if (metaLastParsed) {
      result.chapter = {
        num: parseInt(metaLastParsed[1], 10),
        title: metaLastParsed[2].trim() || null,
      };
    } else {
      // 2) NovelBin fallback: .l-chapter block
      const lChapterMatch = html.match(
        /<div[^>]*class="[^"]*l-chapter[^"]*"[^>]*>[\s\S]*?Chapter\s+(\d+)\s*[: ]\s*([^<]*)/i,
      );
      if (lChapterMatch) {
        result.chapter = {
          num: parseInt(lChapterMatch[1], 10),
          title: lChapterMatch[2].trim(),
        };
      }
    }

    // --- Genres & author via <meta> first ---
    const metaGenre = html.match(
      /<meta[^>]+(?:property|name)=["']og:novel:genre["'][^>]+content=["']([^"']+)["']/i,
    );
    if (metaGenre) {
      result.genres = metaGenre[1]
        .split(',')
        .map((g) => g.trim())
        .filter((g) => g.length > 0 && g.length < 50);
    } else {
      const genreMatch = html.match(
        /<dt[^>]*>Genres?:?\s*<\/dt>\s*<dd[^>]*>([^<]+)<\/dd>/i,
      );
      if (genreMatch) {
        result.genres = genreMatch[1]
          .split(',')
          .map((g) => g.trim())
          .filter((g) => g.length > 0 && g.length < 50);
      }
    }

    const metaAuthor = html.match(
      /<meta[^>]+(?:property|name)=["']og:novel:author["'][^>]+content=["']([^"']+)["']/i,
    );
    if (metaAuthor) {
      result.author = metaAuthor[1]
        .trim()
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&');
    } else {
      const authorMatch =
        html.match(/<dt[^>]*>Author:?\s*<\/dt>\s*<dd[^>]*>([^<]+)<\/dd>/i) ||
        html.match(/Author:\s*([^<,\n]+)/i);
      if (authorMatch) {
        result.author = authorMatch[1]
          .trim()
          .replace(/&quot;/g, '"')
          .replace(/&amp;/g, '&');
      }
    }

    // --- Updated time: prefer .item-time, fallback to og:novel:update_time ---
    const itemTime = html.match(
      /<div[^>]*class="item-time"[^>]*>([^<]+)<\/div>/i,
    );
    if (itemTime) {
      result.site_latest_chapter_time_raw = itemTime[1].trim();
      const parsed = parseTimeAgo(result.site_latest_chapter_time_raw);
      result.site_latest_chapter_time = parsed ? parsed.toISOString() : null;
    } else {
      const metaUpdateTime = html.match(
        /<meta[^>]+(?:property|name)=["']og:novel:update_time["'][^>]+content=["']([^"']+)["']/i,
      );
      if (metaUpdateTime) {
        result.site_latest_chapter_time_raw = metaUpdateTime[1].trim();
        const parsedDate = new Date(result.site_latest_chapter_time_raw);
        result.site_latest_chapter_time = !Number.isNaN(parsedDate.getTime())
          ? parsedDate.toISOString()
          : null;
      }
    }

    // --- Synopsis: NovelArrow's dt/dd pattern first, generic synopsis-class
    // div as fallback. Deliberately NOT using og:description — NovelArrow
    // truncates it (docs/ROADMAP.md "Novel metadata"). Unverified against a
    // live page yet; a wrong match here fails safe (see MAX_SYNOPSIS_LENGTH
    // and the empty-after-cleanup check below), it never corrupts data.
    const synopsisMatch =
      html.match(/<dt[^>]*>Synopsis:?\s*<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/i) ||
      html.match(/<div[^>]*class="[^"]*synopsis[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    if (synopsisMatch) {
      const cleaned = synopsisMatch[1]
        .replace(/<[^>]+>/g, ' ')
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&')
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/\s+/g, ' ')
        .trim();
      // ponytail: guessed ceiling, revisit if a real synopsis exceeds it
      const MAX_SYNOPSIS_LENGTH = 20_000;
      result.synopsis =
        cleaned.length > 0 && cleaned.length <= MAX_SYNOPSIS_LENGTH
          ? cleaned
          : null;
    }

    return result;
  } catch (err) {
    console.error('HTML parsing error:', err);
    return {
      chapter: null,
      genres: [],
      author: null,
      site_latest_chapter_time_raw: null,
      site_latest_chapter_time: null,
      synopsis: null,
    };
  }
}
