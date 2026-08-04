'use strict';

import { STEP, AUTO_PIX, AUTO_MS, PCT_DECIMALS, RESTORE_LIMIT, IGNORE_LOW_PCT } from './config.js';
import { generateDeviceId, getDeviceLabel } from './services/DeviceManager.js';
import {
  normalizePath, normalizeNovelId, isChapterPath,
  parseChapterEnhanced, buildChapterPath,
  extractLatestChapterInfo, extractGenres, extractAuthor, extractUpdateTime, extractCoverUrl,
} from './services/ChapterDetector.js';
import {
  syncProgress, debouncedSync, sendFinal, startConflictChecker, cleanup, cancelPendingSync,
  drainOfflineQueue,
} from './services/ProgressSync.js';
import {
  injectBadge, updateBadgeStatus, updatePill, notify,
  showSyncBanner, maybeShowRestore, showAutoUpdateNotification,
  createHelp, toggleHelp, isRestored, clearRestored,
} from './services/UIManager.js';
import { postAutoUpdate } from './api/client.js';
import type { NovelUpdateMessage } from './types/index.js';

/* ===== Debug helper ===== */
const LOG_TAG = 'ReadSync';
const log = (...args: unknown[]) => { try { console.debug(`[${LOG_TAG}]`, ...args); } catch { /* */ } };

/* ===== Device identity ===== */
const READSYNC_DEVICE_ID = generateDeviceId();
const READSYNC_DEVICE_LABEL = getDeviceLabel();

/* ===== Page context ===== */
const isRefreshTab = !!(window.opener && window.name && window.name.startsWith('_novel_'));

log('Script start', {
  path: location.pathname,
  href: location.href,
  deviceId: READSYNC_DEVICE_ID,
  deviceLabel: READSYNC_DEVICE_LABEL,
  isRefreshTab,
  windowName: window.name,
});

/* ===== iOS fix: find real scroll container ===== */
function findScrollEl(): Element {
  const candidates = [
    document.scrollingElement,
    document.documentElement,
    document.body,
    ...Array.from(document.querySelectorAll('main, article, #content, .content, .reader, [data-scroll], [role="main"]')),
  ].filter(Boolean) as Element[];

  for (const el of candidates) {
    if (el.scrollHeight - el.clientHeight > 200) return el;
  }

  let best: Element = document.scrollingElement ?? document.documentElement;
  let bestDelta = best.scrollHeight - best.clientHeight;
  for (const el of document.querySelectorAll('body *')) {
    try {
      const delta = el.scrollHeight - el.clientHeight;
      if (delta > bestDelta + 200) { best = el; bestDelta = delta; }
    } catch { /* */ }
  }
  return best;
}

let page = findScrollEl();
let scrollHandler: (() => void) | null = null;
const recheckScrollEl = () => {
  const prev = page;
  page = findScrollEl();
  // React can swap the scroll container on SPA navigation — move the
  // element-level listener along with it (the window listener persists).
  if (scrollHandler && prev !== page) {
    prev.removeEventListener('scroll', scrollHandler);
    page.addEventListener('scroll', scrollHandler, { passive: true });
  }
  log('Re-evaluated scroll element', page);
};
window.addEventListener('resize', recheckScrollEl, { passive: true });
new MutationObserver(() => recheckScrollEl()).observe(document.body, { childList: true, subtree: true });

/* ===== Per-chapter state (reset by initForChapter on SPA navigation) ===== */
let normalizedPath = normalizePath(location.pathname);
let storeKey = `nb_scrollpos:${normalizedPath}`;
let completionSynced = false;
log('Normalization', { raw: location.pathname, normalizedPath, storeKey });

/* ===== Shared sync context ===== */
const syncCtx = {
  deviceId: READSYNC_DEVICE_ID,
  deviceLabel: READSYNC_DEVICE_LABEL,
  pageLoadTime: Date.now(),
  getScrollEl: () => page,
  updateBadgeStatus,
  showSyncBanner,
};

/* ===== Percent helper ===== */
const pctNow = (): number => {
  const h = Math.max(1, page.scrollHeight - page.clientHeight);
  const frac = (page as HTMLElement).scrollTop / h;
  return Math.max(0, Math.min(100, frac * 100));
};

/* ===== Hash-based resume (#nbp=xx.x) ===== */
function applyHashResume(): void {
  const m = location.hash?.match(/nbp=([\d.]+)/i);
  if (!m) return;
  const p = Math.max(0, Math.min(100, parseFloat(m[1])));
  const h = Math.max(1, page.scrollHeight - page.clientHeight);
  (page as HTMLElement).scrollTop = (p / 100) * h;
  setTimeout(() => { (page as HTMLElement).scrollTop = (p / 100) * h; }, 500);
  log('applyHashResume', { p });
}

/* ===== Progress bar ===== */
function addProgressBar(): void {
  const bar = document.createElement('div');
  Object.assign(bar.style, {
    position: 'fixed', top: '0', left: '0', height: '4px', background: '#ff4500',
    zIndex: '10000', width: '0%',
  });
  document.body.appendChild(bar);

  const first = pctNow();
  bar.style.width = `${first}%`;
  updatePill(first);
  log('progress bar init', { first });

  function onAnyScroll() {
    // Detect SPA navigation before touching per-chapter state — the 500ms
    // poll may not have ticked yet, and a scroll on the new chapter must
    // not write under the old chapter's storeKey or reuse its flags.
    checkUrlChange();

    const current = pctNow();
    bar.style.width = `${current}%`;
    updatePill(current);

    if (isRestored()) { clearRestored(); return; }

    const prev = parseFloat(localStorage.getItem(storeKey) ?? '0');

    if (current >= RESTORE_LIMIT) {
      // Sync immediately (not debounced) so the completion is recorded even
      // if the user navigates away or closes the tab right after — the
      // debounce would otherwise be cancelled by the SPA chapter reset.
      if (!completionSynced) {
        completionSynced = true;
        log('completion threshold reached, syncing', { current });
        void syncProgress(current, syncCtx);
      }
      localStorage.removeItem(storeKey);
    } else {
      const candidate = Math.max(prev, current);
      if (candidate > IGNORE_LOW_PCT && candidate > prev) {
        localStorage.setItem(storeKey, candidate.toFixed(2));
        debouncedSync(candidate, syncCtx);
      }
    }

    if (Math.abs(current - prev) > 5) {
      log('big scroll delta, syncing', { prev, current });
      debouncedSync(current, syncCtx);
    }
  }

  scrollHandler = onAnyScroll;
  window.addEventListener('scroll', onAnyScroll, { passive: true });
  page.addEventListener('scroll', onAnyScroll, { passive: true });
  log('scroll listeners attached');
}

/* ===== Per-chapter init (full page load AND SPA chapter navigation) ===== */
let heartbeatTimer: ReturnType<typeof setTimeout> | null = null;

function initForChapter(reason: string): void {
  cancelPendingSync(); // a stale debounce would read the NEW location.href
  normalizedPath = normalizePath(location.pathname);
  storeKey = `nb_scrollpos:${normalizedPath}`;
  syncCtx.pageLoadTime = Date.now();
  completionSynced = false;
  recheckScrollEl();
  clearRestored();
  maybeShowRestore(storeKey, () => page, pctNow);
  log('chapter init', { reason, normalizedPath, storeKey });

  // iOS fix: always register an early heartbeat (even at 0%). One pending
  // heartbeat at a time — rapid A/D presses must not stack syncs.
  if (heartbeatTimer) clearTimeout(heartbeatTimer);
  heartbeatTimer = setTimeout(() => {
    heartbeatTimer = null;
    const pct = pctNow();
    log('early heartbeat', { reason, pct });
    void syncProgress(pct, syncCtx);
  }, 800);
}

/* ===== SPA route-change watcher =====
 * NovelArrow is a Next.js App Router SPA: next/prev chapter navigation (and
 * our own A/D keys, which click its React buttons) changes the URL without a
 * page load, so none of the load-time hooks re-fire. Poll the pathname (plus
 * popstate for back/forward) instead of monkey-patching history — robust
 * regardless of Next.js internals or userscript sandboxing. */
let lastSeenPath = location.pathname;
let autoUpdateTimer: ReturnType<typeof setTimeout> | null = null;

function checkUrlChange(): void {
  if (location.pathname === lastSeenPath) return;
  const prevPath = lastSeenPath;
  lastSeenPath = location.pathname;
  log('SPA URL change', { from: prevPath, to: lastSeenPath });
  if (normalizePath(location.pathname) !== normalizedPath) {
    initForChapter('spa-nav');
    // No-ops on chapter pages; covers SPA navigation onto novel main pages.
    // Note: ChapterDetector's realChapterCount cache persists across SPA
    // navs — correct while staying within one novel, the only SPA-nav path.
    if (autoUpdateTimer) clearTimeout(autoUpdateTimer);
    autoUpdateTimer = setTimeout(() => { autoUpdateTimer = null; void autoUpdateNovelInfo(); }, 2000);
  }
}
setInterval(checkUrlChange, 500);
window.addEventListener('popstate', () => setTimeout(checkUrlChange, 0));

/* ===== Auto-scroll ===== */
let autoOn = false;
let autoTimer: ReturnType<typeof setInterval> | null = null;

function toggleAuto(): void {
  if (autoOn) {
    if (autoTimer) clearInterval(autoTimer);
    autoOn = false;
    notify('Auto-Scroll Disabled');
    log('auto-scroll off');
  } else {
    autoTimer = setInterval(() => window.scrollBy(0, AUTO_PIX), AUTO_MS);
    autoOn = true;
    notify('Auto-Scroll Enabled');
    log('auto-scroll on');
  }
}

/* ===== Enhanced navigation ===== */
function navigate(direction: 'next' | 'previous'): void {
  // Stage 1: NovelBin built-in navigation IDs
  let link: HTMLAnchorElement | HTMLButtonElement | null =
    document.querySelector(direction === 'next' ? '#next_chap' : '#prev_chap');

  // Stage 2: NovelArrow — hydrated links to adjacent chapters of this novel.
  // Chapter URLs are /chapter/<slug>/chapter-N-<title>, so find the anchor
  // whose chapter number is exactly current±1 (numeric URL building 404s here).
  if (!link) {
    const arrowMatch = location.pathname.match(/^\/chapter\/([^/]+)\/chapter-?(\d+)/i);
    if (arrowMatch) {
      const slug = arrowMatch[1];
      const currentNum = parseInt(arrowMatch[2], 10);
      const targetNum = currentNum + (direction === 'next' ? 1 : -1);
      link = [...document.querySelectorAll<HTMLAnchorElement>(`a[href*="/chapter/${slug}/"]`)]
        .find(a => {
          const m = a.href.match(/\/chapter-?(\d+)(?:-[^/]*)?\/?$/i);
          return m !== null && parseInt(m[1], 10) === targetNum;
        }) ?? null;
    }
  }

  // Stage 3: NovelArrow reader icon buttons — no href, no text, only aria-label/title
  if (!link) {
    link = document.querySelector(direction === 'next'
      ? 'button[aria-label="Next chapter" i],button[title="Next chapter" i]'
      : 'button[aria-label="Previous chapter" i],button[title="Previous chapter" i]');
    if (link?.hasAttribute('disabled')) link = null;
  }

  // Stage 4: rel="next"/"prev"
  if (!link) {
    link = document.querySelector(direction === 'next'
      ? 'a[rel="next"],link[rel="next"]'
      : 'a[rel="prev"],link[rel="prev"]');
  }

  // Stage 5: Textual buttons (anchors with a real href first, then buttons)
  if (!link) {
    const rx = direction === 'next' ? /(next|›|»)/i : /(prev|previous|‹|«)/i;
    const candidates = [...document.querySelectorAll<HTMLAnchorElement | HTMLButtonElement>('a,button')]
      .filter(el => rx.test((el.textContent ?? '').trim()));
    link = candidates.find(el => Boolean((el as HTMLAnchorElement).href)) ?? candidates[0] ?? null;
  }

  // Stage 6: Build numeric URL (NovelBin-shaped paths only — NovelArrow
  // chapter URLs need the title slug, which we can't reconstruct)
  if (!link && !location.pathname.startsWith('/chapter/')) {
    const info = parseChapterEnhanced(location.pathname);
    if (info) {
      const n = info.num + (direction === 'next' ? 1 : -1);
      if (n >= 1) {
        const newPath = buildChapterPath(location.pathname, info.token, n);
        console.log(`🧭 Fallback build ${direction}: ${newPath}`);
        location.href = newPath;
        return;
      }
    }
  }

  // Stage 7: Navigate — follow the href when there is one, otherwise click
  // the element (NovelArrow's SPA buttons navigate via their React handler)
  const href = (link as HTMLAnchorElement | null)?.href;
  if (href) {
    console.log(`🧭 Using ${direction} link:`, href);
    location.href = href;
  } else if (link) {
    console.log(`🧭 Clicking ${direction} button:`, link);
    link.click();
  } else {
    notify('No further chapters available.');
  }
}

/* ===== Auto-update novel info (runs on novel main pages) ===== */
async function autoUpdateNovelInfo(): Promise<void> {
  // Refresh All names each tab `_novel_<novelId>` and filters replies on that
  // exact id, so the tab name is authoritative — and it is the only id we have
  // when normalizeNovelId cannot parse the URL.
  const openerNovelId = isRefreshTab ? window.name.replace(/^_novel_/, '') : null;

  function notifyOpener(msg: Omit<NovelUpdateMessage, 'type'>): void {
    if (!isRefreshTab || !window.opener || (window.opener as Window & typeof globalThis).closed) return;
    try {
      (window.opener as Window).postMessage({ type: 'NOVEL_UPDATE_COMPLETE', ...msg } satisfies NovelUpdateMessage, '*');
      log('Notified parent:', msg);
    } catch (e) {
      log('Failed to notify parent:', e);
    }
  }

  try {
    const pathname = location.pathname;

    // Both guards below used to return in silence, stranding Refresh All for
    // the full 30s timeout and mislabelling a deliberate skip as a hang.
    if (isChapterPath(pathname)) {
      log('Skipping auto-update on chapter page', { pathname });
      if (openerNovelId) notifyOpener({ novelId: openerNovelId, success: false, reason: 'chapter_page' });
      return;
    }

    const novelId = normalizeNovelId(location.href);
    if (!novelId) {
      log('No novel ID found for auto-update');
      if (openerNovelId) notifyOpener({ novelId: openerNovelId, success: false, reason: 'no_novel_id' });
      return;
    }

    log('Auto-updating novel info for:', novelId);

    const latestChapterInfo = extractLatestChapterInfo();

    if (!latestChapterInfo.latestChapterNum) {
      log('No chapter info found to update');
      notifyOpener({ novelId, success: false, reason: 'no_chapter_info' });
      return;
    }

    const payload = {
      novel_id: novelId,
      chapter_num: latestChapterInfo.latestChapterNum,
      chapter_title: latestChapterInfo.latestChapterTitle,
      genres: extractGenres(),
      author: extractAuthor(),
      update_time_raw: extractUpdateTime(),
      cover_url: extractCoverUrl(),
    };

    log('📤 Sending novel info:', payload);

    try {
      const result = await postAutoUpdate(payload);
      log('Novel info auto-updated successfully!', result);
      showAutoUpdateNotification('✅ Chapter info updated!', 'success');
      notifyOpener({ novelId, success: true, data: result });
    } catch (err) {
      const status = (err as { status?: number }).status ?? 0;
      log('Auto-update failed:', err);
      notifyOpener({ novelId, success: false, reason: 'api_error', status });
      if (status !== 404) {
        showAutoUpdateNotification('⚠️ Update failed', 'error');
      }
    }
  } catch (error) {
    const novelId = normalizeNovelId(location.href) ?? 'unknown';
    console.warn(`[${LOG_TAG}] Auto-update error:`, error);
    if (isRefreshTab && window.opener && !(window.opener as Window & typeof globalThis).closed) {
      try {
        (window.opener as Window).postMessage({
          type: 'NOVEL_UPDATE_COMPLETE',
          novelId,
          success: false,
          reason: 'exception',
          error: (error as Error).message,
        } satisfies NovelUpdateMessage, '*');
      } catch { /* */ }
    }
  }
}

/* ===== Boot ===== */
function boot(): void {
  log('boot()');
  injectBadge(READSYNC_DEVICE_ID);
  applyHashResume();
  addProgressBar();
  initForChapter('boot');

  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const overlayPref = localStorage.getItem('nb_overlay');
  log('env', { isIOS, overlayPref });

  if (!isIOS && overlayPref !== 'false') {
    createHelp(READSYNC_DEVICE_ID);
  } else if (isIOS && overlayPref === 'true') {
    createHelp(READSYNC_DEVICE_ID);
  }

  startConflictChecker(syncCtx);

  // Offline queue: replay anything stranded by a previous offline session,
  // and again whenever the browser reports connectivity is back.
  setTimeout(() => { void drainOfflineQueue(syncCtx); }, 2000);
  window.addEventListener('online', () => { void drainOfflineQueue(syncCtx); });
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}

/* ===== Cleanup ===== */
window.addEventListener('beforeunload', cleanup);

/* ===== Final save on hide/unload ===== */
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') { log('visibilitychange -> hidden'); sendFinal(pctNow(), syncCtx); }
});
window.addEventListener('pagehide', () => { log('pagehide'); sendFinal(pctNow(), syncCtx); });

/* ===== Keyboard shortcuts ===== */
document.onkeydown = (e: KeyboardEvent) => {
  const t = e.target as HTMLElement | null;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;

  if (e.key.toLowerCase() === 'x' && e.ctrlKey && e.shiftKey) {
    const p = pctNow();
    const clean = location.href.replace(/#.*$/, '');
    const url = `${clean}#nbp=${p.toFixed(PCT_DECIMALS)}`;
    void (async () => {
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(url);
          notify(`Copied resume link (${p.toFixed(PCT_DECIMALS)}%)`);
          log('resume link hotkey copied', { url });
        } else {
          window.prompt('Copy resume link:', url);
        }
      } catch {
        window.prompt('Copy resume link:', url);
      }
    })();
    return;
  }

  // e.key is uppercase while Shift is held, so match case-insensitively
  switch (e.key.toLowerCase()) {
    case 'a': case 'arrowleft': navigate('previous'); break;
    case 'd': case 'arrowright': navigate('next'); break;
    case 'w': window.scrollBy(0, -STEP); break;
    case 's': if (e.shiftKey) toggleAuto(); else window.scrollBy(0, STEP); break;
    case 'h': if (e.shiftKey) toggleHelp(READSYNC_DEVICE_ID); break;
  }
};

/* ===== Trigger auto-update on page load ===== */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => { void autoUpdateNovelInfo(); }, 2000);
  });
} else {
  setTimeout(() => { void autoUpdateNovelInfo(); }, 2000);
}

