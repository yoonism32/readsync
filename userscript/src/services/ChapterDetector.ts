import { CHAPTER_PAGE_NAV_LOOKAHEAD, MAX_CHAPTER_NUM } from '../config.js';
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
      if (num > 0 && num < MAX_CHAPTER_NUM) return num;
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
      if (num > 0 && num < MAX_CHAPTER_NUM) return num;
    }

    const anyNumberMatch = lastSegment.match(/(\d+)/);
    if (anyNumberMatch) {
      const num = parseInt(anyNumberMatch[1], 10);
      if (num > 0 && num < MAX_CHAPTER_NUM) return num;
    }
  } catch {
    const simpleMatch = href.match(/\/(\d+)[^/]*\/?$/);
    if (simpleMatch) {
      const num = parseInt(simpleMatch[1], 10);
      if (num > 0 && num < MAX_CHAPTER_NUM) return num;
    }
  }
  return null;
}

/**
 * Is this path a chapter page rather than a novel page?
 *
 * A chapter always lives *below* the novel slug: /chapter/<slug>/<chapter> on
 * NovelArrow, /b/<slug>/<chapter> on NovelBin. /novel/<slug> and /b/<slug> are
 * novel pages regardless of what the slug looks like.
 *
 * That depth check matters because the numeric-prefix heuristic below exists
 * for NovelBin URLs like /b/slug/31-the-beginning, and without it a novel whose
 * slug merely *starts* with digits ("100x-rebate-sharing-system…") is misread
 * as a chapter — which silently disabled auto-update on that novel and let
 * progress sync record scroll position on its main page.
 */
export function isChapterPath(pathname: string): boolean {
  const parts = pathname.split('/').filter(Boolean);
  if (parts.length <= 2) return false;
  const lastSegment = parts[parts.length - 1];
  return !!(pathname.match(/chapter-?\d+/i) || /^\d+/.test(lastSegment));
}

/**
 * Given the current page URL, derive the novel's main/base page URL.
 *
 * bot/src/parseNovelInfo.ts has its own, simpler version of this same
 * derivation (see NovelScraper.ts) for the Node/regex-on-HTML scraping
 * context — the two can't share a module without new cross-package build
 * tooling (userscript is Vite-bundled, bot is plain tsc with a rootDir
 * restricted to bot/src, and neither is an npm workspace today), so keep
 * them in sync by hand and see the parity test in
 * __tests__/regression/novelBaseUrlDerivation.test.ts, which documents
 * where the two currently agree and where they diverge.
 */
export function deriveNovelBaseUrl(currentUrl: string): string {
  // NovelArrow: /chapter/<slug>/chapter-N-title → novel page is /novel/<slug>
  const arrowMatch = currentUrl.match(/^(https?:\/\/[^/]+)\/chapter\/([^/]+)\//);
  if (arrowMatch) {
    return `${arrowMatch[1]}/novel/${arrowMatch[2]}`;
  }

  let base = currentUrl
    .replace(/\/c*chapter-?\d+.*$/, '')
    .replace(/\/\d+[-][^/]*$/, '');

  if (base === currentUrl) {
    const baseMatch = currentUrl.match(/(https?:\/\/[^/]+\/(?:b|novel)\/[^/]+)\//);
    if (baseMatch) base = baseMatch[1];
  }

  return base;
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

export function extractLatestChapterInfo(
  currentChapterNum: number | null = null,
): LatestChapterInfo {
  try {
    // Every strategy below contributes a *candidate* and the largest wins.
    // Returning at the first strategy that produced a number is what let a
    // free-chapter-only meta tag mask the true count, and what let the
    // first-30-chapters fallback report 30 for a 92-chapter novel.
    const candidates: number[] = [];
    let metaTitle: string | null = null;
    let lChapterTitle: string | null = null;
    // Highest chapter number backed by a signal that names an actual
    // chapter (meta or .l-chapter) — see the header-count comment below for
    // why this must never lose to a bare count.
    let namedNum = 0;

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
        namedNum = Math.max(namedNum, num);
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
          namedNum = Math.max(namedNum, chapterNum);
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

    /**
     * Strategy 4: the header's "<N> Chapters" figure. Only trusted when
     * nothing above already named a specific chapter (namedNum === 0) —
     * "<N> Chapters" is a document COUNT, not a chapter NUMBER, and
     * NovelArrow's numbering isn't 1:1 with it (bonus/side entries like
     * "897_2" inflate the count past the true latest). Letting it win over a
     * titled meta chapter is exactly what happened to three novels in
     * production on 2026-08-06: immortality-through-array-formations (off by
     * 1), i-can-see-through-all-things-information (off by 2), and
     * longevity-by-picking-up-attributes-in-the-battlefield (off by 14) —
     * all three ended up with a stored latest_chapter_num paired with a
     * title that named a *different*, lower chapter, proving the header
     * figure was never a real chapter. The damage was permanent: admin.ts's
     * update guard never lets latest_chapter_num decrease, so "next chapter"
     * navigation dead-ended at "No further chapters available" forever.
     *
     * It still needs to win when nothing names a chapter at all — a meta
     * like "Epilogue" has no digits, and without the header NovelArrow's
     * server-rendered chapter list (capped at the first 30, ascending) would
     * report 30 for a 92-chapter novel forever.
     */
    const headerCount = extractHeaderChapterCount();
    if (headerCount && namedNum === 0) {
      log('Candidate from header chapter count (nothing named a chapter)', { num: headerCount });
      candidates.push(headerCount);
    }

    // Only worth a network round-trip when the header gave us nothing — on a
    // novel page it always does, so this now fires mainly on chapter pages.
    // A flat "< 500" threshold isn't enough there: on a chapter page,
    // `maxChapter` mostly comes from "Next Chapter" nav (current + 1), so a
    // reader anywhere past chapter 500 always clears it without local
    // detection ever having found the true latest.
    const localDetectionUnreliable =
      maxChapter === 0 ||
      maxChapter < 500 ||
      (currentChapterNum != null &&
        maxChapter <= currentChapterNum + CHAPTER_PAGE_NAV_LOOKAHEAD);
    if (headerCount === null && localDetectionUnreliable) {
      log('Local detection seems limited, trying main page fetch', { localMax: maxChapter, currentChapterNum });

      const novelMainUrl = deriveNovelBaseUrl(location.href);

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

    // Corroborated by an authoritative source (a titled chapter name, the
    // page's own header count, or a confirmed main-page fetch)? Or did it
    // come solely from the generic "any link containing chapter" scan
    // (maxChapter, Strategies 1-3) with nothing else agreeing? That scan is
    // what mistook a "Next Chapter" nav link (current + 1) for the latest
    // chapter in the 2026-08-12 corruption incident — ChapterCorrection.ts
    // uses this flag to refuse to trust an unverified number as grounds for
    // overwriting a higher stored value, no matter how many times it repeats.
    const authoritativeMax = Math.max(namedNum, headerCount ?? 0, realChapterCount ?? 0);
    const verified = finalChapterCount <= authoritativeMax;

    if (finalChapterCount > 0) {
      log('Found latest chapter info', {
        num: finalChapterCount,
        title: finalTitle,
        verified,
        candidates,
      });
      return { latestChapterNum: finalChapterCount, latestChapterTitle: finalTitle, verified };
    }

    log('No latest chapter info found');
    return { latestChapterNum: null, latestChapterTitle: null, verified: false };
  } catch (error) {
    log('Error extracting latest chapter info:', error);
    return { latestChapterNum: null, latestChapterTitle: null, verified: false };
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
          if (chapterNum > 0 && chapterNum < MAX_CHAPTER_NUM) {
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
    if (num > 0 && num < MAX_CHAPTER_NUM) {
      const res: ChapterInfo = { token: 'chapter', num, source: 'url-number-prefix' };
      log('Using chapter from URL (number-prefix format):', res);
      return res;
    }
  }

  // Strategy 3: Any number anywhere in the last segment
  const anyNumberMatch = lastSegment.match(/(\d+)/);
  if (anyNumberMatch) {
    const num = parseInt(anyNumberMatch[1], 10);
    if (num > 0 && num < MAX_CHAPTER_NUM) {
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
