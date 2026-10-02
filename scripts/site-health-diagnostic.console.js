// ReadSync site-health diagnostic — paste into DevTools console, do not install.
//
// Mirrors every URL/DOM extraction point the real userscript relies on —
// userscript/src/services/ChapterDetector.ts (isChapterPath,
// extractChapterFromUrl, parseChapterEnhanced, normalizeNovelId,
// deriveNovelBaseUrl, extractLatestChapterInfo's signals),
// userscript/src/services/PageMetadata.ts (genre/author/cover/synopsis/
// update-time), userscript/src/main.ts (findScrollEl), the built userscript's
// @match rules, and the server-side URL handling in src/services/ReaderUrl.ts
// and src/services/NovelService.ts —
// and reports FOUND/MISSING/PASS/FAIL/ERROR for each, independently, with a
// pointer to which production file+function to touch if it's broken. Also
// runs a "candidate-signals" pass (untapped meta keys, misspelled variants,
// broader synopsis selectors, and a cross-check that named-chapter signals
// agree with each other) and a "content-safety" pass on chapter pages
// (paywall/gate keyword scan, rough word count, next-chapter nav link) —
// neither is read by production today, but both catch things worth knowing
// before adopting a new site.
//
// Read-only. Makes zero network requests by default (opt in with
// `window.__READSYNC_DIAG_ALLOW_FETCH__ = true` beforehand to also fetch the
// derived novel base URL, mirroring the real main-page-fetch fallback) and
// never writes to the DOM, storage, or the ReadSync API.
//
// Not imported anywhere — same convention as debug-chapter-detect.console.js
// in this directory: a standalone mirror, not a live import. If the
// production regex/selectors change, re-copy them here or this will quietly
// test against a stale rule and give false confidence.
//
// Usage: open a live novel (landing) page, paste this whole file into the
// console, read the report; then repeat on a live chapter page — the two
// page types exercise different sections (chapter-page checks only run when
// the URL classifies as a chapter).
(function () {
  'use strict';

  const MAX_CHAPTER_NUM = 100000; // config.ts

  const results = []; // { section, name, status: 'FOUND'|'MISSING'|'ERROR'|'PASS'|'FAIL', value, fix }

  function record(section, name, status, value, fix) {
    results.push({ section, name, status, value, fix });
  }

  // Runs fn(); classifies a null/undefined/false/'' result as MISSING,
  // anything else as FOUND, and a thrown error as ERROR. `fix` is only
  // shown when the check is MISSING/ERROR.
  function probe(section, name, fn, fix) {
    try {
      const value = fn();
      const missing = value === null || value === undefined || value === false || value === '';
      record(section, name, missing ? 'MISSING' : 'FOUND', value, fix);
    } catch (e) {
      record(section, name, 'ERROR', String((e && e.message) || e), fix);
    }
  }

  /* ============================================================
   * 1. Page identity
   * ============================================================ */

  const href = location.href;
  const host = location.hostname.replace(/^www\./, '');
  const pathname = location.pathname;

  const KNOWN_READER_HOSTS = [
    // src/services/ReaderUrl.ts READER_HOSTS
    'novelbin.com', 'novelbin.me', 'novelbin.net', 'novelbin.org',
    'novelarrow.com', // now 302s to novelping.com; still accepted
    'novelping.com',
  ];

  record('identity', 'host', KNOWN_READER_HOSTS.includes(host) ? 'PASS' : 'FAIL', host,
    'New/unrecognized host. Add it to READER_HOSTS (src/services/ReaderUrl.ts), ' +
    'to the @match block (userscript/vite.config.ts buildUserscriptHeader), and to ' +
    'normalizeNovelId\'s route regex (userscript/src/services/ChapterDetector.ts) if the ' +
    'path segment name (/b/, /novel/, /chapter/) also changed.');
  record('identity', 'pathname', 'FOUND', pathname, '');

  // userscript/vite.config.ts buildUserscriptHeader. Keep this explicit so a
  // candidate host cannot look healthy in the DOM checks while the released
  // userscript would never run there in the first place.
  const userscriptWouldInject =
    (host === 'novelarrow.com' && (/^\/novel\/[^/]+\/?$/i.test(pathname) || /^\/chapter\/[^/]+\/[^/]+\/?$/i.test(pathname))) ||
    (/^novelbin\.(?:com|me|net|org)$/i.test(host) && /^\/b\/[^/]+(?:\/.*)?$/i.test(pathname)) ||
    (host === 'novelping.com' && /^\/(?:novel|book)\/[^/]+(?:\/.*)?$/i.test(pathname));
  record('identity', 'built userscript @match would inject here', userscriptWouldInject ? 'PASS' : 'FAIL', userscriptWouldInject,
    'userscript/vite.config.ts:buildUserscriptHeader — add a @match rule for this host and ' +
    'route shape. Parser compatibility is irrelevant until the browser actually injects ReadSync.');

  /* ============================================================
   * 2. URL classification — is this a chapter page or novel page?
   * userscript/src/services/ChapterDetector.ts: isChapterPath
   * ============================================================ */

  function isChapterPath(p) {
    const parts = p.split('/').filter(Boolean);
    if (parts.length <= 2) return false;
    const lastSegment = parts[parts.length - 1];
    return !!(p.match(/chapter-?(?:auto-\d+-)*\d+/i) || /^\d+/.test(lastSegment));
  }

  const looksLikeChapter = isChapterPath(pathname);
  record('classification', 'isChapterPath(pathname)', 'FOUND', looksLikeChapter,
    'ChapterDetector.ts:isChapterPath — depth+regex heuristic. If a redesigned URL puts ' +
    'chapters at a different depth or drops the numeric/word "chapter" token, this ' +
    'misclassifies novel pages as chapters (or vice versa) and silently disables sync.');

  /* ============================================================
   * 3. Novel ID / slug extraction
   * ChapterDetector.ts: normalizeNovelId
   * ============================================================ */

  function normalizeNovelId(url) {
    const m = url.match(/\/(?:b|novel|chapter|book)\/([^/]+)/);
    return m ? `novelbin:${m[1].toLowerCase()}` : null;
  }
  probe('classification', 'normalizeNovelId(href)', () => normalizeNovelId(href),
    'ChapterDetector.ts:normalizeNovelId — expects a /b/, /novel/ or /chapter/ path segment ' +
    'immediately before the slug. A new site using e.g. /series/<slug> needs this regex updated ' +
    '(and every other regex below that repeats the same b|novel|chapter alternation).');

  /* ============================================================
   * 4. Chapter number extraction from the URL
   * ChapterDetector.ts: extractChapterFromUrl, parseChapterEnhanced
   * ============================================================ */

  function extractChapterFromUrl(hrefIn) {
    let p;
    try { p = new URL(hrefIn, location.origin).pathname; } catch { return null; }
    if (!isChapterPath(p)) return null;
    const m = p.match(/chapter-?(?:auto-(\d+)|(\d+))/i);
    if (m) return parseInt(m[1] ?? m[2], 10);
    const last = p.split('/').pop() ?? '';
    const startNum = last.match(/^(\d+)/);
    if (startNum) { const n = parseInt(startNum[1], 10); if (n > 0 && n < MAX_CHAPTER_NUM) return n; }
    const anyNum = last.match(/(\d+)/);
    if (anyNum) { const n = parseInt(anyNum[1], 10); if (n > 0 && n < MAX_CHAPTER_NUM) return n; }
    return null;
  }

  if (looksLikeChapter) {
    probe('chapter-page', 'extractChapterFromUrl(href)', () => extractChapterFromUrl(href),
      'ChapterDetector.ts:extractChapterFromUrl — tries "chapter-N" / "chapter-auto-N" first, ' +
      'then a numeric URL-segment prefix, then any digits. Update the first regex if the site\'s ' +
      'chapter token spelling changes (e.g. "ep-12" instead of "chapter-12").');

    // Which branch of parseChapterEnhanced would fire, mirrored for both formats:
    const arrowMatch = pathname.match(/\/chapter\/[^/]+\/chapter-?(?:auto-(\d+)|(\d+))(?:-[^/]*)?\/?$/i);
    const standardMatch = pathname.match(/\/b\/[^/]+\/((c*)chapter)-?(\d+)(?:-[^/]*)?\/?$/i);
    const pingMatch = pathname.match(/^\/(?:novel|book)\/[^/]+\/chapter-?(?:auto-(\d+)|(\d+))(?:-[^/]*)?\/?$/i);
    let branch = 'none-of-the-known-url-formats';
    if (arrowMatch) branch = `url-novelarrow (num=${arrowMatch[1] ?? arrowMatch[2]})`;
    else if (pingMatch) branch = `url-novelping (num=${pingMatch[1] ?? pingMatch[2]})`;
    else if (standardMatch) branch = `url-standard/novelbin (num=${standardMatch[3]})`;
    record('chapter-page', 'parseChapterEnhanced URL branch', branch === 'none-of-the-known-url-formats' ? 'MISSING' : 'FOUND', branch,
      'ChapterDetector.ts:parseChapterEnhanced — neither known URL shape matched. On real ' +
      'NovelArrow/NovelBin pages this falls back to content-based title parsing, but that ' +
      'fallback was written assuming these two hosts; verify it still finds a chapter number ' +
      'via the "content-based chapter detection" checks below before trusting it on a new site.');

    // Content-based chapter detection (title/h1/breadcrumb regex bank)
    const chapterPatterns = [
      /Chapter\s+(\d+)/i, /Ch\.?\s*(\d+)/i, /Episode\s+(\d+)/i, /Part\s+(\d+)/i,
      /#\s*(\d+)/, /^\s*(\d+)\s*[-–—:.]/, /^\s*(\d+)\s+/, /^\s*#?\s*(\d+)\s*$/,
    ];
    function tryContentPatterns(text) {
      for (const re of chapterPatterns) {
        const m = text.match(re);
        if (m) { const n = parseInt(m[1], 10); if (n > 0 && n < MAX_CHAPTER_NUM) return n; }
      }
      return null;
    }
    probe('chapter-page', 'content: document.title', () => tryContentPatterns(document.title),
      'ChapterDetector.ts:getCurrentChapterFromContent, strategy "title" — the <title> no ' +
      'longer contains a recognizable "Chapter N" phrase.');

    // Stored history follows the URL index. If a site's title number differs
    // (NovelPing supreme-magus-novel: URL chapter-1000 vs "Chapter 991"),
    // content-first parsing would save the wrong chapter.
    {
      const urlNum = extractChapterFromUrl(href);
      const titleNum = tryContentPatterns(document.title);
      if (urlNum != null && titleNum != null) {
        record('chapter-page', 'URL chapter index equals title chapter number', urlNum === titleNum ? 'PASS' : 'FAIL',
          `url=${urlNum} title=${titleNum}`,
          'The URL index and the page-title number differ on this chapter. parseChapterEnhanced must stay ' +
          'URL-first for this host (see the url-novelping branch); a content-first parse would store the title number.');
      }
    }

    const chapterSelectors = ['[class*="title"]', '.chapter-title', '.title', '.chapter-header', '.chapter-name', '[class*="chapter"]'];
    let selectorHit = null;
    for (const sel of chapterSelectors) {
      for (const el of document.querySelectorAll(sel)) {
        const t = (el.textContent || '').trim();
        if (t.length > 1 && t.length < 200) {
          const n = tryContentPatterns(t);
          if (n) { selectorHit = { selector: sel, num: n, text: t.slice(0, 80) }; break; }
        }
      }
      if (selectorHit) break;
    }
    probe('chapter-page', 'content: chapter-ish selectors', () => selectorHit,
      'ChapterDetector.ts:getCurrentChapterFromContent, strategy "content(selector)" — none of ' +
      chapterSelectors.join(', ') + ' matched a "Chapter N"-shaped text node. A redesign that ' +
      'renamed these classes needs new selectors here.');

    // Scroll container (progress-sync prerequisite, main.ts:findScrollEl)
    function findScrollEl() {
      const candidates = [
        document.scrollingElement, document.documentElement, document.body,
        ...Array.from(document.querySelectorAll('main, article, #content, .content, .reader, [data-scroll], [role="main"]')),
      ].filter(Boolean);
      for (const el of candidates) {
        if (el.scrollHeight - el.clientHeight > 200) return el;
      }
      return document.scrollingElement || document.documentElement;
    }
    const scrollEl = findScrollEl();
    const scrollDelta = scrollEl ? scrollEl.scrollHeight - scrollEl.clientHeight : 0;
    record('chapter-page', 'findScrollEl() found a real scroll container', scrollDelta > 200 ? 'PASS' : 'FAIL',
      `<${scrollEl && scrollEl.tagName}${scrollEl && scrollEl.className ? '.' + String(scrollEl.className).split(' ')[0] : ''}> delta=${scrollDelta}px`,
      'main.ts:findScrollEl — no candidate container has enough scrollable height. Progress % ' +
      'would read as stuck at 0/100. A new site\'s reader likely uses a different scroll ' +
      'container (check for a fixed-height inner div with overflow:auto).');

    // buildChapterPath sanity (NovelBin-style only, per its own doc comment)
    probe('chapter-page', 'buildChapterPath produces a plausible next-chapter URL', () => {
      const hasHyphen = /chapter-\d+/i.test(pathname);
      const sep = hasHyphen ? '-' : '';
      const next = pathname.replace(/(\/b\/[^/]+\/)(c*chapter)-?\d+(?:-[^/]*)?/i,
        (_, p1, tok) => `${p1}${tok}${sep}${(parseInt((pathname.match(/(\d+)/) || [0,0])[1], 10) || 0) + 1}`);
      return next !== pathname ? next : null;
    }, 'ChapterDetector.ts:buildChapterPath — NovelBin-only, by design (its own comment says ' +
      'NovelArrow chapter URLs require the title slug and 404 on a numeric-only URL). MISSING ' +
      'here on a NovelArrow-shaped URL is expected, not a bug.');
  } else {
    record('chapter-page', '(skipped — page did not classify as a chapter page)', 'FOUND', null, '');
  }

  /* ============================================================
   * 5. Server-side validators — src/services/ReaderUrl.ts
   * (what the API itself would accept from this exact URL)
   * ============================================================ */

  function isReaderUrl(value) {
    if (typeof value !== 'string' || value.length > 4096) return false;
    try {
      const u = new URL(value);
      return u.protocol === 'https:' && !u.username && !u.password && !u.port &&
        KNOWN_READER_HOSTS.includes(u.hostname.replace(/^www\./, ''));
    } catch { return false; }
  }
  function isReaderChapterUrl(value) {
    if (!isReaderUrl(value)) return false;
    const u = new URL(value);
    const h = u.hostname.replace(/^www\./, '');
    const p = u.pathname;
    if (h === 'novelarrow.com') return /^\/chapter\/[^/]+\/chapter-?(?:auto-\d+|\d+)(?:[-/]|$)/i.test(p);
    if (h === 'novelping.com') return /^\/(?:novel|book)\/[^/]+\/chapter-?(?:auto-\d+|\d+)(?:[-/]|$)/i.test(p);
    return /^\/b\/[^/]+\/(?:c*chapter-?\d+|\d+)(?:[-/]|$)/i.test(p);
  }
  record('server-would-accept', 'isReaderUrl(href)', isReaderUrl(href) ? 'PASS' : 'FAIL', isReaderUrl(href),
    'src/routes/progress.ts and friends reject any URL isReaderUrl rejects, before even ' +
    'looking at chapter parsing. If host check fails, nothing downstream matters yet.');
  if (looksLikeChapter) {
    record('server-would-accept', 'isReaderChapterUrl(href)', isReaderChapterUrl(href) ? 'PASS' : 'FAIL', isReaderChapterUrl(href),
      'src/services/ReaderUrl.ts:isReaderChapterUrl — the API will silently drop a progress ' +
      'snapshot whose URL fails this, even if the userscript itself parsed a chapter number fine.');
  }

  // src/services/NovelService.ts repeats the slug/title/base/chapter parsing
  // after ReaderUrl accepts a progress or bookmark request. These are a
  // separate migration boundary from the userscript mirrors above.
  const SERVER_NOVEL_SLUG_PATTERN = /\/(?:b|novel|chapter|book)\/([^/]+)/;
  function serverNormalizeNovelId(url) {
    const m = url.match(SERVER_NOVEL_SLUG_PATTERN);
    return m ? `novelbin:${m[1].toLowerCase()}` : null;
  }
  function serverExtractNovelTitle(url) {
    const m = url.match(SERVER_NOVEL_SLUG_PATTERN);
    return m ? m[1].replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) : 'Unknown Novel';
  }
  function serverDeriveNovelMainUrl(url) {
    const arrowChapter = url.match(/^(https?:\/\/[^/]+)\/chapter\/([^/]+)/);
    if (arrowChapter) return `${arrowChapter[1]}/novel/${arrowChapter[2]}`;
    return url.replace(/\/c*chapter-?(?:auto-\d+|\d+).*$/, '');
  }
  function serverParseChapterFromUrl(url) {
    const m = url.match(/\/(c*chapter)-(?:auto-(\d+)|(\d+))(?:-\d+)?/i);
    return m ? parseInt(m[2] ?? m[3], 10) : null;
  }

  probe('server-would-accept', 'NovelService.normalizeNovelId(href)', () => serverNormalizeNovelId(href),
    'src/services/NovelService.ts:NOVEL_SLUG_PATTERN — add the new route segment here too; ' +
    'otherwise progress passes URL validation but cannot be attached to a novel.');
  record('server-would-accept', 'NovelService.extractNovelTitle(href)',
    serverExtractNovelTitle(href) === 'Unknown Novel' ? 'FAIL' : 'PASS', serverExtractNovelTitle(href),
    'src/services/NovelService.ts:extractNovelTitle uses the same route regex and otherwise stores "Unknown Novel".');
  if (looksLikeChapter) {
    const serverBase = serverDeriveNovelMainUrl(href);
    record('server-would-accept', 'NovelService.deriveNovelMainUrl(href)', serverBase !== href ? 'PASS' : 'FAIL', serverBase,
      'src/services/NovelService.ts:deriveNovelMainUrl — the server could not reduce this chapter URL to its novel landing page.');
    probe('server-would-accept', 'NovelService.parseChapterFromUrl(href)', () => serverParseChapterFromUrl(href),
      'src/services/NovelService.ts:parseChapterFromUrl — update its chapter-token regex for this route.');
  }

  /* ============================================================
   * 6. Novel metadata extraction — userscript/src/services/PageMetadata.ts
   * (meaningful mainly on a novel page, harmless to run anywhere)
   * ============================================================ */

  probe('metadata', 'extractGenres()', () => {
    const meta = document.querySelector('meta[property="og:novel:genre"], meta[name="og:novel:genre"]');
    if (meta) return meta.getAttribute('content');
    const els = document.querySelectorAll('[class*="genre"], [class*="tag"], .categories');
    if (els.length) {
      const g = Array.from(els).map(e => (e.textContent || '').trim()).filter(t => t && t.length < 50).slice(0, 10).join(', ');
      return g || null;
    }
    return null;
  }, 'PageMetadata.ts:extractGenres — neither the og:novel:genre meta tag nor any ' +
    '[class*="genre"]/[class*="tag"]/.categories element was found.');

  probe('metadata', 'extractAuthor()', () => {
    const meta = document.querySelector('meta[property="og:novel:author"], meta[name="og:novel:author"]');
    if (meta) return meta.getAttribute('content');
    for (const sel of ['[class*="author"]', '.by-line', '[itemprop="author"]']) {
      const el = document.querySelector(sel);
      if (el) {
        const t = (el.textContent || '').replace(/^Author:\s*/i, '').trim();
        if (t.length > 0 && t.length < 100) return t;
      }
    }
    return null;
  }, 'PageMetadata.ts:extractAuthor — no og:novel:author meta and no matching author selector.');

  probe('metadata', 'extractCoverUrl()', () => {
    const meta = document.querySelector('meta[property="og:image"], meta[name="og:image"]');
    const url = (meta && meta.getAttribute('content') || '').trim();
    return /^https:\/\/[^/]*\/.+/.test(url) ? url : null;
  }, 'PageMetadata.ts:extractCoverUrl — no usable og:image meta tag.');

  const coverMeta = document.querySelector('meta[property="og:image"], meta[name="og:image"]');
  const coverCandidate = (coverMeta && coverMeta.getAttribute('content') || '').trim();
  let coverAccepted = false;
  try {
    const cover = new URL(coverCandidate);
    coverAccepted = cover.protocol === 'https:' && !cover.username && !cover.password && !cover.port &&
      KNOWN_READER_HOSTS.some(readerHost => cover.hostname === `images.${readerHost}`);
  } catch { /* reported as false below */ }
  record('server-would-accept', 'isReaderCoverUrl(og:image)', coverAccepted ? 'PASS' : 'FAIL', coverCandidate || null,
    'src/services/ReaderUrl.ts:isReaderCoverUrl — add the candidate cover CDN shape or auto-update will discard the cover URL.');

  probe('metadata', 'extractUpdateTime()', () => {
    const meta = document.querySelector('meta[name="og:novel:update_time"], meta[property="og:novel:update_time"]');
    const c = meta && meta.getAttribute('content') && meta.getAttribute('content').trim();
    if (c) return c;
    for (const sel of ['.item-time', '[class*="update"]', '[class*="time"]', 'time']) {
      const el = document.querySelector(sel);
      if (el) {
        const t = (el.textContent || '').trim();
        if (/ago|hour|day|minute|week|month|year|\d{4}/i.test(t)) return t;
      }
    }
    return null;
  }, 'PageMetadata.ts:extractUpdateTime — no update-time meta or matching time-ish selector.');

  probe('metadata', 'extractSynopsis() — NovelPing #novel-description-content', () => {
    const el = document.querySelector('#novel-description-content');
    return el ? ((el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60) || null) : null;
  }, 'PageMetadata.ts:extractSynopsis — #novel-description-content is missing or empty (NovelPing layout).');

  probe('metadata', 'extractSynopsis() — modern NovelArrow layout', () => {
    const heading = Array.from(document.querySelectorAll('span')).find(el => (el.textContent || '').trim() === 'Synopsis');
    const panel = heading && heading.closest('.site-panel');
    const modern = panel && panel.querySelector('.site-reading-prose');
    return modern ? '.site-panel > .site-reading-prose found' : null;
  }, 'PageMetadata.ts:extractSynopsis — modern path missing (a <span>Synopsis</span> inside ' +
    '.site-panel with a .site-reading-prose sibling). Falls through to the legacy path below.');

  probe('metadata', 'extractSynopsis() — legacy dt/dd or [class*=synopsis] fallback', () => {
    const dtEls = Array.from(document.querySelectorAll('dt'));
    const dt = dtEls.find(d => /^synopsis:?$/i.test((d.textContent || '').trim()));
    const dd = dt && dt.nextElementSibling;
    const container = (dd && dd.tagName === 'DD') ? dd : document.querySelector('[class*="synopsis"]');
    return container ? (container.tagName + (container.className ? '.' + String(container.className).split(' ')[0] : '')) : null;
  }, 'PageMetadata.ts:extractSynopsis — legacy fallback also found nothing. Synopsis would ' +
    'import as null on this page as things stand.');

  /* ============================================================
   * 7. Latest-chapter detection signals — ChapterDetector.ts:extractLatestChapterInfo
   * (novel page checks; harmless on a chapter page too)
   * ============================================================ */

  probe('latest-chapter-signals', 'og:novel:latest_chapter_name meta', () => {
    const meta = document.querySelector('meta[name="og:novel:latest_chapter_name"], meta[property="og:novel:latest_chapter_name"]');
    return meta ? (meta.getAttribute('content') || '').trim() : null;
  }, 'ChapterDetector.ts:extractLatestChapterInfo Strategy 0 — this meta tag is the most ' +
    'trusted "named chapter" signal; without it, detection falls back to weaker link-scanning.');

  probe('latest-chapter-signals', '.l-chapter .chapter-title link', () => {
    const el = document.querySelector('.l-chapter .chapter-title');
    return el ? (el.textContent || '').trim() : null;
  }, 'ChapterDetector.ts:extractLatestChapterInfo Strategy — .l-chapter block not found or ' +
    'restructured.');

  probe('latest-chapter-signals', 'header "N Chapters" count', () => {
    const re = /^\s*([\d,]+)\s+Chapters?\s*$/i;
    for (const el of document.querySelectorAll('span')) {
      const m = (el.textContent || '').match(re);
      if (m) { const n = parseInt(m[1].replace(/,/g, ''), 10); if (n > 0 && n < 100000) return n; }
    }
    return null;
  }, 'ChapterDetector.ts:extractHeaderChapterCount — no <span> matches "<N> Chapters". This is ' +
    'the fallback used when nothing else names a specific chapter, so losing it drops coverage ' +
    'for novels whose only signal was the chapter-list-capped-at-30 case.');

  const chapterLinkCount = document.querySelectorAll('a[href*="chapter"]').length;
  record('latest-chapter-signals', 'a[href*="chapter"] count on page', chapterLinkCount > 0 ? 'FOUND' : 'MISSING', chapterLinkCount,
    'If this is 0 on a novel page that clearly lists chapters, the site now builds chapter ' +
    'links without the literal substring "chapter" in the href — every href-based strategy ' +
    'in extractLatestChapterInfo needs a new selector.');

  const chapterListSelectors = ['.chapter-list', '.list-chapter', '[class*="chapter-list"]', '.chapters'];
  let chapterListHit = null;
  for (const sel of chapterListSelectors) {
    const c = document.querySelector(sel);
    if (c) { chapterListHit = { selector: sel, links: c.querySelectorAll('a').length }; break; }
  }
  probe('latest-chapter-signals', 'chapter-list container', () => chapterListHit,
    'ChapterDetector.ts Strategy 3 — none of ' + chapterListSelectors.join(', ') + ' matched.');

  const pathParts = pathname.split('/');
  const currentSectionIndex = pathParts.findIndex(p => p === 'b' || p === 'novel' || p === 'chapter' || p === 'book');
  const currentNovelSlug = currentSectionIndex >= 0 ? (pathParts[currentSectionIndex + 1] || '') : '';
  probe('latest-chapter-signals', 'novel slug for latest-chapter fetch/cache', () => currentNovelSlug || null,
    'ChapterDetector.ts:extractLatestChapterInfo — add the candidate route segment to the ' +
    'b|novel|chapter section lookup and its same-novel link selector. Without this, a chapter-page ' +
    'fetch can discover the real latest chapter but cannot cache or return it for this novel.');

  /* ============================================================
   * 7b. Candidate signals — not read by production today, but worth
   * checking before concluding a site "lacks" a signal. Covers cases found
   * in practice: a site shipping the same data under a misspelled meta key
   * (novelping.com's "lastest_chapter_name"), or naming its synopsis
   * container "description" instead of "synopsis".
   * ============================================================ */

  const typoMeta = document.querySelector('meta[name="og:novel:lastest_chapter_name"], meta[property="og:novel:lastest_chapter_name"]');
  probe('candidate-signals', 'meta og:novel:lastest_chapter_name (typo spelling)', () => typoMeta && (typoMeta.getAttribute('content') || '').trim(),
    'Not queried by production (which only checks the correctly-spelled "latest"). If this is ' +
    'FOUND while the correctly-spelled key above is MISSING, the site just spells it differently ' +
    '— add this key as a fallback in extractLatestChapterInfo rather than treating the site as ' +
    'lacking the signal entirely.');
  probe('candidate-signals', 'meta og:novel:lastest_chapter_url (typo spelling, direct chapter URL)', () => {
    const m = document.querySelector('meta[name="og:novel:lastest_chapter_url"], meta[property="og:novel:lastest_chapter_url"]');
    return m && (m.getAttribute('content') || '').trim();
  }, 'Even more useful than the name variant if present — a direct URL to the latest chapter, no ' +
    'number-parsing required at all.');
  probe('candidate-signals', 'meta og:novel:novel_name (clean title, unused by PageMetadata.ts today)', () => {
    const m = document.querySelector('meta[property="og:novel:novel_name"], meta[name="og:novel:novel_name"]');
    return m && (m.getAttribute('content') || '').trim();
  }, '');
  probe('candidate-signals', 'meta og:novel:status (ongoing/completed, unused today)', () => {
    const m = document.querySelector('meta[property="og:novel:status"], meta[name="og:novel:status"]');
    return m && (m.getAttribute('content') || '').trim();
  }, '');
  probe('candidate-signals', 'meta og:novel:read_url (start-reading shortcut, unused today)', () => {
    const m = document.querySelector('meta[property="og:novel:read_url"], meta[name="og:novel:read_url"]');
    return m && (m.getAttribute('content') || '').trim();
  }, '');
  probe('candidate-signals', 'synopsis via broader [class*="description"] selector', () => {
    const el = document.querySelector('[class*="description" i]');
    return el ? (el.tagName + (el.className ? '.' + String(el.className).split(' ')[0] : '') + ': ' + (el.textContent || '').trim().slice(0, 80)) : null;
  }, 'PageMetadata.ts:extractSynopsis — add [class*="description"] as another legacy fallback ' +
    'selector alongside [class*="synopsis"].');

  // Cross-check: do the named-chapter signals actually agree with each
  // other? A real disagreement here is exactly the failure shape the
  // 2026-08-06 incident comment in ChapterDetector.ts warns about — surface
  // it explicitly instead of leaving it buried in separate FOUND rows.
  {
    const readNum = (text) => {
      const m = text && text.match(/Chapter\s+(\d+)/i);
      return m ? parseInt(m[1], 10) : null;
    };
    const correctMeta = document.querySelector('meta[name="og:novel:latest_chapter_name"], meta[property="og:novel:latest_chapter_name"]');
    const lChapterEl = document.querySelector('.l-chapter .chapter-title');
    const signals = {
      'og:latest (correct spelling)': readNum(correctMeta && correctMeta.getAttribute('content')),
      'og:lastest (typo spelling)': readNum(typoMeta && typoMeta.getAttribute('content')),
      '.l-chapter': readNum(lChapterEl && lChapterEl.textContent),
      // production (extractLatestChapterInfo) prefers the link's href number over its text
      '.l-chapter href': (() => {
        const m = ((lChapterEl && lChapterEl.getAttribute('href')) || '').match(/chapter-?(?:auto-)?(\d+)/i);
        return m ? parseInt(m[1], 10) : null;
      })(),
    };
    const present = Object.entries(signals).filter(([, v]) => v != null);
    const distinctValues = new Set(present.map(([, v]) => v));
    if (present.length >= 2) {
      record('candidate-signals', 'named-chapter-signal agreement', distinctValues.size === 1 ? 'PASS' : 'FAIL',
        JSON.stringify(Object.fromEntries(present)),
        distinctValues.size === 1 ? '' :
        'These named signals disagree on the actual latest chapter number. Do not assume either ' +
        'is correct — open the higher one directly and confirm it exists and its title matches ' +
        'before trusting it.');
    }
  }

  /* ============================================================
   * 8. Base-URL derivation (used to fetch the novel's main page for
   * chapter-count corroboration) — no network call unless opted in.
   * ============================================================ */

  function deriveNovelBaseUrl(currentUrl) {
    const arrowMatch = currentUrl.match(/^(https?:\/\/[^/]+)\/chapter\/([^/]+)\//);
    if (arrowMatch) return `${arrowMatch[1]}/novel/${arrowMatch[2]}`;
    let base = currentUrl.replace(/\/c*chapter-?(?:auto-\d+|\d+).*$/, '').replace(/\/\d+[-][^/]*$/, '');
    if (base === currentUrl) {
      const baseMatch = currentUrl.match(/(https?:\/\/[^/]+\/(?:b|novel|book)\/[^/]+)\//);
      if (baseMatch) base = baseMatch[1];
    }
    return base;
  }
  if (looksLikeChapter) {
    const derivedBase = deriveNovelBaseUrl(href);
    record('chapter-page', 'deriveNovelBaseUrl(href)', derivedBase !== href ? 'PASS' : 'FAIL', derivedBase,
      'ChapterDetector.ts:deriveNovelBaseUrl — could not strip the chapter segment back to a ' +
      'plausible novel URL. Cover-import and the main-page-fetch fallback both depend on this.');

    if (window.__READSYNC_DIAG_ALLOW_FETCH__ === true) {
      fetch(derivedBase).then(r => r.text()).then(html => {
        console.log('%c[diag] fetch(' + derivedBase + ') → ' + html.length + ' bytes, HTML sample:', 'color:#888', html.slice(0, 200));
      }).catch(e => console.warn('[diag] derived base-URL fetch failed:', e));
    }
  }

  /* ============================================================
   * 9. Gated/paywall heuristic + chapter-to-chapter navigation
   * (chapter pages only). Neither check exists in production yet — these
   * are exploratory, catching a failure mode that hasn't hit a known site
   * but is common on aggregators: a "chapter" page that's actually a
   * paywall/login interstitial, which would silently break scroll-based
   * progress tracking (the reader never reaches real content to scroll).
   * ============================================================ */

  if (looksLikeChapter) {
    const gateKeywords = /premium chapter|unlock (?:this )?chapter|subscribe to (?:read|continue)|sign in to (?:read|continue)|log in to (?:read|continue)|(?:spend|costs?|pay) \d+ coins?|advance chapters?|members? only/i;
    const bodyText = (document.body && document.body.innerText) || '';
    const gateHit = bodyText.match(gateKeywords);
    record('content-safety', 'paywall/gate keyword scan', gateHit ? 'FAIL' : 'PASS', gateHit ? gateHit[0] : 'none found',
      gateHit ? 'This chapter page contains gate-like wording (' + JSON.stringify(gateHit[0]) + '). If ' +
      'this is a locked/premium chapter, the actual chapter text may be replaced by a paywall ' +
      'prompt — verify the scroll container found above actually contains chapter prose, not an ' +
      'unlock interstitial, before trusting progress-sync on gated chapters.' : '');

    const wordCount = bodyText.trim().split(/\s+/).filter(Boolean).length;
    record('content-safety', 'rough page word count (sanity, not a real chapter-length check)', wordCount > 300 ? 'PASS' : 'FAIL', wordCount,
      wordCount > 300 ? '' : 'Suspiciously short for a chapter page — could be a gate/interstitial, an ' +
      'ad-heavy stub, or a chapter that genuinely is this short. Eyeball the actual page.');

    const navLink = Array.from(document.querySelectorAll('a[rel="next"], a'))
      .find(a => a.getAttribute('rel') === 'next' || /^next(\s+chapter)?$/i.test((a.textContent || '').trim()));
    probe('content-safety', 'next-chapter nav link', () => navLink && navLink.getAttribute('href'),
      'No next-chapter link found by rel="next" or "Next"/"Next Chapter" text — if this site has ' +
      'one under different wording, buildChapterPath-style next/prev navigation would need a new ' +
      'selector to find it.');

    // Mirrors userscript/src/services/NavLinks.ts as used by main.ts:navigate:
    // Stage 2 takes the first ENABLED, RENDERED aria-labelled button
    // (findAriaChapterButton) and Stage 2b the first a.js-chapter-nav link with a
    // real href (findChapterNavAnchor). Hidden same-labelled controls (NovelPing's
    // 0x0 audio-player buttons) are ignored, so they are reported, not failed.
    // MISSING (not FAIL) when neither exists: normal at the end/start of a chain
    // (the disabled end is <a href="javascript:void(0)">).
    for (const direction of ['Next', 'Previous']) {
      const ariaSel = `button[aria-label="${direction} chapter" i],button[title="${direction} chapter" i]`;
      const ariaButtons = Array.from(document.querySelectorAll(ariaSel));
      const usableButton = ariaButtons.find(b => {
        const r = b.getBoundingClientRect();
        return !b.hasAttribute('disabled') && r.width > 0 && r.height > 0;
      });
      const label = direction === 'Next' ? /^next/i : /^prev/i;
      const navAnchor = Array.from(document.querySelectorAll('a.js-chapter-nav')).find(a =>
        label.test((a.textContent || '').trim()) && /^(?:https?:\/\/|\/)/i.test(a.getAttribute('href') || ''));
      const via = usableButton ? 'aria-button' : navAnchor ? `a.js-chapter-nav → ${navAnchor.getAttribute('href')}` : null;
      record('content-safety', `navigate(${direction.toLowerCase()}) resolves to a usable control`,
        via ? 'PASS' : 'MISSING',
        { via, ignoredHiddenOrDisabledAriaButtons: ariaButtons.length - (usableButton ? 1 : 0) },
        'No enabled+rendered aria button and no a.js-chapter-nav link with a real href. Expected at the ' +
        'start/end of a chain; otherwise main.ts:navigate would fall through to the later stages.');
    }

    const proseContainer = document.querySelector('#chapter, .chapter, [itemprop="articleBody"], .chapter-content');
    const proseWordCount = ((proseContainer && proseContainer.textContent) || '').trim().split(/\s+/).filter(Boolean).length;
    record('content-safety', 'chapter prose container word count', proseWordCount > 300 ? 'PASS' : 'FAIL',
      proseContainer ? {
        element: `${proseContainer.tagName}${proseContainer.id ? '#' + proseContainer.id : ''}`,
        words: proseWordCount,
      } : null,
      proseWordCount > 300 ? '' : 'No substantial chapter-specific prose container was found. The whole-page ' +
      'word count can be inflated by navigation, comments, or modal content, so inspect the reader selector before migration.');
  }

  /* ============================================================
   * Report
   * ============================================================ */

  const order = ['identity', 'classification', 'chapter-page', 'server-would-accept', 'metadata', 'latest-chapter-signals', 'candidate-signals', 'content-safety'];
  const bySection = {};
  for (const r of results) (bySection[r.section] ||= []).push(r);

  const emoji = { PASS: '✅', FOUND: '✅', FAIL: '❌', ERROR: '💥', MISSING: '⚠️' };

  console.log(`%c=== ReadSync site-health diagnostic — ${host}${pathname} ===`, 'font-weight:bold;font-size:13px');
  console.log(`Page classified as: ${looksLikeChapter ? 'CHAPTER page' : 'NOVEL / other page'}`);

  let failCount = 0, missingCount = 0, errorCount = 0;
  for (const section of order) {
    const rows = bySection[section];
    if (!rows || !rows.length) continue;
    console.groupCollapsed(`${section} (${rows.length} checks)`);
    console.table(rows.map(r => ({ check: r.name, status: `${emoji[r.status] || ''} ${r.status}`, value: typeof r.value === 'object' ? JSON.stringify(r.value) : r.value })));
    for (const r of rows) {
      if (r.status === 'FAIL') { failCount++; console.warn(`FAIL — ${r.name}\n  Fix: ${r.fix}`); }
      if (r.status === 'MISSING') { missingCount++; if (r.fix) console.info(`MISSING — ${r.name}\n  Fix: ${r.fix}`); }
      if (r.status === 'ERROR') { errorCount++; console.error(`ERROR — ${r.name}: ${r.value}\n  Fix: ${r.fix}`); }
    }
    console.groupEnd();
  }

  console.log(
    `%cSummary: ${failCount} FAIL, ${errorCount} ERROR, ${missingCount} MISSING (out of ${results.length} checks).`,
    failCount || errorCount ? 'color:#c00;font-weight:bold' : 'color:#080;font-weight:bold',
  );
  if (failCount === 0 && errorCount === 0) {
    console.log('Core sync pipeline (URL classification + chapter number + server acceptance) looks intact on this page.');
  } else {
    console.log('Core sync pipeline has at least one broken check above — start there before worrying about metadata.');
  }

  const report = { url: href, isChapterPage: looksLikeChapter, failCount, errorCount, missingCount, results };
  window.__READSYNC_DIAG_LAST_REPORT__ = report;
  return report;
})();
