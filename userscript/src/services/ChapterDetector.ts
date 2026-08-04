import type { ChapterInfo, LatestChapterInfo } from '../types/index.js';

const LOG_TAG = 'ReadSync';
const log = (...args: unknown[]) => { try { console.debug(`[${LOG_TAG}]`, ...args); } catch { /* */ } };

/* ===== URL normalization ===== */

export function normalizePath(path: string): string {
  // Handle both /chapter-343 and /chapter343 formats
  return path.replace(/\/c+chapter-?/, '/chapter-');
}

export function normalizeUrl(href: string): string {
  // Handle both formats in URLs
  return href.replace(/#.*$/, '').replace(/\/c+chapter-?/, '/chapter-');
}

export function normalizeNovelId(url: string): string | null {
  // NovelBin used /b/<slug>; NovelArrow uses /novel/<slug> and /chapter/<slug>/...
  // Slugs are identical across both sites, so both normalize to the same
  // legacy "novelbin:" ID to preserve existing reading history.
  const match = url.match(/\/(?:b|novel|chapter)\/([^/]+)/);
  return match ? `novelbin:${match[1].toLowerCase()}` : null;
}

/* ===== Chapter number extraction helpers ===== */

export function extractChapterNum(text: string): number | null {
  const patterns = [
    /Chapter\s+(\d+)/i,
    /Ch\.?\s*(\d+)/i,
    /Episode\s+(\d+)/i,
    /#\s*(\d+)/,                        // "#31" or "# 31"
    /^\s*(\d+)\s*[-–—:.]/,             // "31. Title" or "31 - Title"
    /^\s*(\d+)\s+/,                     // "31 Title"
    /^\s*#?\s*(\d+)\s*$/,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > 0 && num < 10000) return num;
    }
  }
  return null;
}

export function extractChapterFromUrl(href: string): number | null {
  // Try standard chapter format first
  const chapterMatch = href.match(/chapter-?(\d+)/i);
  if (chapterMatch) return parseInt(chapterMatch[1], 10);

  try {
    const url = new URL(href, location.origin);
    const lastSegment = url.pathname.split('/').pop() ?? '';

    const numberAtStartMatch = lastSegment.match(/^(\d+)/);
    if (numberAtStartMatch) {
      const num = parseInt(numberAtStartMatch[1], 10);
      if (num > 0 && num < 10000) return num;
    }

    const anyNumberMatch = lastSegment.match(/(\d+)/);
    if (anyNumberMatch) {
      const num = parseInt(anyNumberMatch[1], 10);
      if (num > 0 && num < 10000) return num;
    }
  } catch {
    const simpleMatch = href.match(/\/(\d+)[^/]*\/?$/);
    if (simpleMatch) {
      const num = parseInt(simpleMatch[1], 10);
      if (num > 0 && num < 10000) return num;
    }
  }
  return null;
}

/* ===== Latest chapter detection ===== */

// Module-level cache for the real chapter count fetched from the main novel page
let realChapterCount: number | null = null;

const CHAPTER_COUNT_RE = /^\s*([\d,]+)\s+Chapters?\s*$/i;

/**
 * Read the "<N> Chapters" figure NovelArrow renders in the novel header.
 *
 * It is the only complete size signal available without client-side rendering:
 * the og:novel meta names the latest *free* chapter (premium chapters run ahead
 * of it), and the server-rendered chapter list is just the first 30 ascending —
 * everything past that loads when the Chapters tab is opened.
 */
export function extractHeaderChapterCount(root: ParentNode = document): number | null {
  for (const el of Array.from(root.querySelectorAll('span'))) {
    const match = el.textContent?.match(CHAPTER_COUNT_RE);
    if (!match) continue;
    const num = parseInt(match[1].replace(/,/g, ''), 10);
    if (num > 0 && num < 100000) return num;
  }
  return null;
}

export function extractLatestChapterInfo(): LatestChapterInfo {
  try {
    // Every strategy below contributes a *candidate* and the largest wins.
    // Returning at the first strategy that produced a number is what let a
    // free-chapter-only meta tag mask the true count, and what let the
    // first-30-chapters fallback report 30 for a 92-chapter novel.
    const candidates: number[] = [];
    let metaTitle: string | null = null;
    let lChapterTitle: string | null = null;

    // Strategy 0: og:novel:latest_chapter_name meta — server-rendered on
    // NovelArrow novel pages (name= attr) and NovelBin (property= attr).
    // Content looks like "Chapter 3118 Dying City".
    const latestMeta = document.querySelector<HTMLMetaElement>(
      'meta[name="og:novel:latest_chapter_name"], meta[property="og:novel:latest_chapter_name"]',
    );
    if (latestMeta) {
      const content = latestMeta.getAttribute('content')?.trim() ?? '';
      const num = extractChapterNum(content);
      if (num) {
        const titleMatch = content.match(/Chapter\s+\d+\s*[-:]?\s*(.+)/i);
        metaTitle = titleMatch ? titleMatch[1].trim() : (content || null);
        log('Candidate from og:novel meta', { num, title: metaTitle });
        candidates.push(num);
      }
    }

    const latestChapterElement = document.querySelector('.l-chapter');
    if (latestChapterElement) {
      const chapterLink = latestChapterElement.querySelector<HTMLAnchorElement>('.chapter-title');
      if (chapterLink) {
        const linkText = chapterLink.textContent?.trim() ?? '';

        // URL is ground truth for chapter number — handles dual-numbered titles like
        // "Chapter 808  Chapter 327: Title" where text regex picks the wrong number
        const numFromUrl = chapterLink.href ? extractChapterFromUrl(chapterLink.href) : null;
        const textMatch = linkText.match(/Chapter\s+(\d+)\s*[-:]\s*(.+)/i);
        const chapterNum = numFromUrl ?? (textMatch ? parseInt(textMatch[1], 10) : extractChapterNum(linkText));
        const chapterTitle = textMatch ? textMatch[2].trim() : (linkText || null);

        if (chapterNum) {
          log('Candidate from .l-chapter', { num: chapterNum, title: chapterTitle, source: numFromUrl ? 'url' : 'text' });
          lChapterTitle = chapterTitle;
          candidates.push(chapterNum);
        }
      }
    }

    const pathParts = location.pathname.split('/');
    // Slug follows the /b/ (NovelBin), /novel/ or /chapter/ (NovelArrow) segment
    const sectionIndex = pathParts.findIndex(p => p === 'b' || p === 'novel' || p === 'chapter');
    const novelSlug = sectionIndex >= 0 ? (pathParts[sectionIndex + 1] ?? '') : '';

    let maxChapter = 0;
    let maxChapterTitle: string | null = null;

    // Strategy 1: Links with "chapter" in href
    document.querySelectorAll<HTMLAnchorElement>('a[href*="chapter"]').forEach(link => {
      const hrefMatch = link.href.match(/chapter-?(\d+)/i);
      if (hrefMatch) {
        const num = parseInt(hrefMatch[1], 10);
        if (num > maxChapter) {
          maxChapter = num;
          const textMatch = link.textContent?.match(/Chapter\s+\d+\s*:\s*(.+)/i);
          maxChapterTitle = textMatch ? textMatch[1].trim() : (link.textContent?.trim() ?? null);
        }
      }
    });

    // Strategy 2: Links to same novel (catches number-prefix format)
    if (novelSlug) {
      document.querySelectorAll<HTMLAnchorElement>(`a[href*="/b/${novelSlug}/"], a[href*="/chapter/${novelSlug}/"]`).forEach(link => {
        const num = extractChapterFromUrl(link.href);
        if (num && num > maxChapter) {
          maxChapter = num;
          maxChapterTitle = link.textContent?.trim() ?? null;
        }
      });
    }

    // Strategy 3: Check chapter list containers
    const chapterListSelectors = ['.chapter-list', '.list-chapter', '[class*="chapter-list"]', '.chapters'];
    for (const selector of chapterListSelectors) {
      const container = document.querySelector(selector);
      if (container) {
        container.querySelectorAll<HTMLAnchorElement>('a').forEach(link => {
          const num = extractChapterFromUrl(link.href) ?? extractChapterNum(link.textContent?.trim() ?? '');
          if (num && num > maxChapter) {
            maxChapter = num;
            maxChapterTitle = link.textContent?.trim() ?? null;
          }
        });
      }
    }

    if (maxChapter > 0) candidates.push(maxChapter);

    // Strategy 4: the header's "<N> Chapters" figure. On NovelArrow novel pages
    // this is the only signal that sees past the first 30 rendered chapters.
    const headerCount = extractHeaderChapterCount();
    if (headerCount) {
      log('Candidate from header chapter count', { num: headerCount });
      candidates.push(headerCount);
    }

    // Only worth a network round-trip when the header gave us nothing — on a
    // novel page it always does, so this now fires mainly on chapter pages.
    if (headerCount === null && (maxChapter === 0 || maxChapter < 500)) {
      log('Local detection seems limited, trying main page fetch', { localMax: maxChapter });

      let novelMainUrl = location.href;

      // NovelArrow: /chapter/<slug>/chapter-N-title → novel page is /novel/<slug>
      const arrowMatch = location.href.match(/^(https?:\/\/[^/]+)\/chapter\/([^/]+)\//);
      if (arrowMatch) {
        novelMainUrl = `${arrowMatch[1]}/novel/${arrowMatch[2]}`;
      } else {
        novelMainUrl = location.href
          .replace(/\/c*chapter-?\d+.*$/, '')
          .replace(/\/\d+[-][^/]*$/, '');

        if (novelMainUrl === location.href) {
          const baseMatch = location.href.match(/(https?:\/\/[^/]+\/(?:b|novel)\/[^/]+)\//);
          if (baseMatch) novelMainUrl = baseMatch[1];
        }
      }

      fetch(novelMainUrl)
        .then(response => response.text())
        .then(html => {
          const parser = new DOMParser();
          const mainPageDoc = parser.parseFromString(html, 'text/html');
          let mainPageMax = maxChapter;

          // Meta tag is the most reliable source on the fetched novel page
          const fetchedMeta = mainPageDoc.querySelector<HTMLMetaElement>(
            'meta[name="og:novel:latest_chapter_name"], meta[property="og:novel:latest_chapter_name"]',
          );
          if (fetchedMeta) {
            const metaNum = extractChapterNum(fetchedMeta.getAttribute('content') ?? '');
            if (metaNum && metaNum > mainPageMax) mainPageMax = metaNum;
          }

          mainPageDoc.querySelectorAll<HTMLAnchorElement>('a[href*="chapter"]').forEach(link => {
            const match = link.href.match(/chapter-?(\d+)/i);
            if (match) {
              const num = parseInt(match[1], 10);
              if (num > mainPageMax) mainPageMax = num;
            }
          });

          if (novelSlug) {
            mainPageDoc.querySelectorAll<HTMLAnchorElement>(`a[href*="/b/${novelSlug}/"], a[href*="/chapter/${novelSlug}/"]`).forEach(link => {
              const num = extractChapterFromUrl(link.href);
              if (num && num > mainPageMax) mainPageMax = num;
            });
          }

          if (mainPageMax > maxChapter) {
            log('Found real chapter count from main page!', { was: maxChapter, now: mainPageMax });
            realChapterCount = mainPageMax;
          }
        })
        .catch(err => log('Main page fetch failed (non-critical)', err));
    }

    // A cached count from a previous main-page fetch is one more candidate —
    // never an override, or a smaller stale value would win outright.
    if (realChapterCount) candidates.push(realChapterCount);

    const finalChapterCount = candidates.length ? Math.max(...candidates) : 0;
    // Prefer a title that names an actual chapter. When the header count wins
    // it carries no title of its own, and emitting null here would blank the
    // stored title server-side (admin.ts writes the title whenever the number
    // advances).
    const finalTitle = metaTitle ?? lChapterTitle ?? maxChapterTitle;

    if (finalChapterCount > 0) {
      log('Found latest chapter info', {
        num: finalChapterCount,
        title: finalTitle,
        candidates,
      });
      return { latestChapterNum: finalChapterCount, latestChapterTitle: finalTitle };
    }

    log('No latest chapter info found');
    return { latestChapterNum: null, latestChapterTitle: null };
  } catch (error) {
    log('Error extracting latest chapter info:', error);
    return { latestChapterNum: null, latestChapterTitle: null };
  }
}

/* ===== Current chapter detection (content-first) ===== */

function getCurrentChapterFromContent(): ChapterInfo | null {
  try {
    const chapterPatterns = [
      /Chapter\s+(\d+)/i,
      /Ch\.?\s*(\d+)/i,
      /Episode\s+(\d+)/i,
      /Part\s+(\d+)/i,
      /#\s*(\d+)/,
      /^\s*(\d+)\s*[-–—:.]/,
      /^\s*(\d+)\s+/,
      /^\s*#?\s*(\d+)\s*$/,
    ];

    const tryPatterns = (text: string, source: string): ChapterInfo | null => {
      for (const pattern of chapterPatterns) {
        const match = text.match(pattern);
        if (match) {
          const chapterNum = parseInt(match[1], 10);
          if (chapterNum > 0 && chapterNum < 10000) {
            log(`Found current chapter from ${source}`, { text: text.substring(0, 100), chapterNum, pattern: pattern.toString() });
            return { num: chapterNum, token: 'chapter', title: text, source };
          }
        }
      }
      return null;
    };

    // Strategy 1: Page title
    const titleResult = tryPatterns(document.title, 'title');
    if (titleResult) return titleResult;

    // Strategy 2: Chapter-related elements
    const chapterSelectors = [
      '[class*="title"]', '.chapter-title', '.title',
      '.chapter-header', '.chapter-name', '[class*="chapter"]',
    ];
    for (const selector of chapterSelectors) {
      for (const element of document.querySelectorAll(selector)) {
        const text = element.textContent?.trim() ?? '';
        if (text.length > 1 && text.length < 200) {
          const result = tryPatterns(text, `content(${selector})`);
          if (result) return result;
        }
      }
    }

    // Strategy 3: H1 headers
    for (const h1 of document.querySelectorAll('h1')) {
      const text = h1.textContent?.trim() ?? '';
      const result = tryPatterns(text, 'h1');
      if (result) return result;
    }

    // Strategy 4: Breadcrumbs
    for (const crumb of document.querySelectorAll('.breadcrumb, [class*="breadcrumb"], .navigation, .nav')) {
      const text = crumb.textContent?.trim() ?? '';
      const result = tryPatterns(text, 'breadcrumb');
      if (result) return result;
    }

    // Strategy 5: Direct text of header elements
    for (const header of document.querySelectorAll('h1, h2, h3, .header, [class*="header"]')) {
      const directText = Array.from(header.childNodes)
        .filter(n => n.nodeType === Node.TEXT_NODE)
        .map(n => n.textContent?.trim() ?? '')
        .join(' ')
        .trim();
      if (directText) {
        const result = tryPatterns(directText, 'header-direct');
        if (result) return result;
      }
    }

    log('No current chapter found in content');
    return null;
  } catch (error) {
    log('Error extracting current chapter from content:', error);
    return null;
  }
}

export function parseChapterEnhanced(pathname: string): ChapterInfo | null {
  // NovelArrow (/chapter/<slug>/chapter-N-title-slug): the URL is ground
  // truth. The SPA reader's DOM (sidebar widgets, stale title after
  // client-side navigation) can carry a neighbouring chapter number, so
  // content scanning must not run first on these routes.
  const arrowMatch = pathname.match(/\/chapter\/[^/]+\/chapter-?(\d+)(?:-[^/]*)?\/?$/i);
  if (arrowMatch) {
    const res: ChapterInfo = {
      token: 'chapter',
      num: parseInt(arrowMatch[1], 10),
      source: 'url-novelarrow',
    };
    log('Using chapter from URL (NovelArrow format):', res);
    return res;
  }

  // Other sites: try page content first
  const contentChapter = getCurrentChapterFromContent();
  if (contentChapter) {
    log('Using chapter from content:', contentChapter);
    return contentChapter;
  }

  // Fallback to URL parsing
  log('Falling back to URL parsing for chapter detection');

  // Strategy 1b: NovelBin format (chapter-31, cchapter31, etc.)
  const standardMatch = pathname.match(/\/b\/[^/]+\/((c*)chapter)-?(\d+)(?:-[^/]*)?\/?$/i);
  if (standardMatch) {
    const res: ChapterInfo = {
      token: standardMatch[1],
      num: parseInt(standardMatch[3], 10),
      source: 'url-standard',
    };
    log('Using chapter from URL (standard format):', res);
    return res;
  }

  // Strategy 2: Number-prefix format
  const lastSegment = pathname.split('/').pop() ?? '';
  const numberAtStartMatch = lastSegment.match(/^(\d+)/);
  if (numberAtStartMatch) {
    const num = parseInt(numberAtStartMatch[1], 10);
    if (num > 0 && num < 10000) {
      const res: ChapterInfo = { token: 'chapter', num, source: 'url-number-prefix' };
      log('Using chapter from URL (number-prefix format):', res);
      return res;
    }
  }

  // Strategy 3: Any number anywhere in the last segment
  const anyNumberMatch = lastSegment.match(/(\d+)/);
  if (anyNumberMatch) {
    const num = parseInt(anyNumberMatch[1], 10);
    if (num > 0 && num < 10000) {
      const res: ChapterInfo = { token: 'chapter', num, source: 'url-any-number' };
      log('Using chapter from URL (extracted number):', res);
      return res;
    }
  }

  log('parseChapter no match', { pathname });
  return null;
}

/**
 * Build next/prev path preserving token and slug.
 * NovelBin URLs only — NovelArrow chapter URLs require the title slug
 * (/chapter/<slug>/chapter-N-<title> — numeric-only 404s), so callers must
 * not use this for /chapter/ paths.
 */
export function buildChapterPath(pathname: string, _token: string, newNum: number): string {
  const hasHyphen = /chapter-\d+/i.test(pathname);
  const separator = hasHyphen ? '-' : '';
  return pathname.replace(
    /(\/b\/[^/]+\/)(c*chapter)-?\d+(?:-[^/]*)?/i,
    (_, p1: string, chapToken: string) => `${p1}${chapToken}${separator}${newNum}`,
  );
}

/* ===== Page metadata extraction ===== */

export function extractGenres(): string | null {
  try {
    const metaGenre = document.querySelector<HTMLMetaElement>('meta[property="og:novel:genre"], meta[name="og:novel:genre"]');
    if (metaGenre) return metaGenre.getAttribute('content');

    const genreElements = document.querySelectorAll('[class*="genre"], [class*="tag"], .categories');
    if (genreElements.length > 0) {
      const genres = Array.from(genreElements)
        .map(el => el.textContent?.trim() ?? '')
        .filter(text => text.length > 0 && text.length < 50)
        .slice(0, 10)
        .join(', ');
      if (genres) return genres;
    }
    return null;
  } catch (error) {
    log('Error extracting genres:', error);
    return null;
  }
}

export function extractAuthor(): string | null {
  try {
    const metaAuthor = document.querySelector<HTMLMetaElement>('meta[property="og:novel:author"], meta[name="og:novel:author"]');
    if (metaAuthor) return metaAuthor.getAttribute('content');

    const authorSelectors = ['[class*="author"]', '.by-line', '[itemprop="author"]'];
    for (const selector of authorSelectors) {
      const element = document.querySelector(selector);
      if (element) {
        const text = element.textContent?.trim() ?? '';
        const cleaned = text.replace(/^Author:\s*/i, '').trim();
        if (cleaned.length > 0 && cleaned.length < 100) return cleaned;
      }
    }
    return null;
  } catch (error) {
    log('Error extracting author:', error);
    return null;
  }
}

export function extractCoverUrl(): string | null {
  try {
    // og:image on the novel page is the exact cover URL — the server can't
    // reliably guess CDN paths (and its own fetches get bot-filtered).
    const meta = document.querySelector<HTMLMetaElement>(
      'meta[property="og:image"], meta[name="og:image"]',
    );
    const url = meta?.getAttribute('content')?.trim() ?? '';
    return /^https:\/\/[^/]*\/.+/.test(url) ? url : null;
  } catch (error) {
    log('Error extracting cover URL:', error);
    return null;
  }
}

export function extractUpdateTime(): string | null {
  try {
    // NovelArrow serves an ISO timestamp in the og:novel:update_time meta
    const metaTime = document.querySelector<HTMLMetaElement>(
      'meta[name="og:novel:update_time"], meta[property="og:novel:update_time"]',
    );
    const metaContent = metaTime?.getAttribute('content')?.trim();
    if (metaContent) return metaContent;

    const timeSelectors = ['.item-time', '[class*="update"]', '[class*="time"]', 'time'];
    for (const selector of timeSelectors) {
      const element = document.querySelector(selector);
      if (element) {
        const text = element.textContent?.trim() ?? '';
        if (/ago|hour|day|minute|week|month|year|\d{4}/i.test(text)) return text;
      }
    }
    return null;
  } catch (error) {
    log('Error extracting update time:', error);
    return null;
  }
}
