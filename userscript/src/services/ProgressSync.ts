import { READSYNC_API_KEY, SYNC_DEBOUNCE_MS, COMPARE_CHECK_MS, QUIET_SYNC } from '../config.js';
import { postProgress, beaconProgress, compareProgress } from '../api/client.js';
import { parseChapterEnhanced, extractLatestChapterInfo, normalizeUrl, normalizeNovelId } from './ChapterDetector.js';
import type { SyncPayload } from '../types/index.js';

const LOG_TAG = 'ReadSync';
const log = (...args: unknown[]) => { try { console.debug(`[${LOG_TAG}]`, ...args); } catch { /* */ } };

interface SyncContext {
  deviceId: string;
  deviceLabel: string;
  pageLoadTime: number;
  getScrollEl: () => Element;
  updateBadgeStatus: (text: string, isError?: boolean) => void;
  showSyncBanner: (globalState: import('../types/index.js').GlobalState) => void;
}

let syncTimeout: ReturnType<typeof setTimeout> | null = null;
let compareInterval: ReturnType<typeof setInterval> | null = null;

/** Check whether the current page is a chapter page (vs novel main page) */
function isChapterPage(): boolean {
  const pathname = location.pathname;
  const lastSegment = pathname.split('/').pop() ?? '';
  return !!(pathname.match(/chapter-?\d+/i) || /^\d+/.test(lastSegment));
}

export async function syncProgress(percent: number, ctx: SyncContext): Promise<void> {
  if (!isChapterPage()) {
    log('Skipping progress sync on main page', { pathname: location.pathname });
    return;
  }

  log('syncProgress invoked', { percent });
  const chapterInfo = parseChapterEnhanced(location.pathname);
  log('parseChapterEnhanced result (syncProgress)', chapterInfo);
  if (!chapterInfo) return;

  const latestChapterInfo = extractLatestChapterInfo();

  const payload: SyncPayload = {
    user_key: READSYNC_API_KEY,
    device_id: ctx.deviceId,
    device_label: ctx.deviceLabel,
    novel_url: normalizeUrl(location.href),
    percent,
    seconds_on_page: Math.floor((Date.now() - ctx.pageLoadTime) / 1000),
    latest_chapter_num: latestChapterInfo.latestChapterNum,
    latest_chapter_title: latestChapterInfo.latestChapterTitle,
    current_chapter_num: chapterInfo.num,
    current_chapter_source: chapterInfo.source,
  };

  try {
    log('Sending payload', payload);
    const result = await postProgress(payload);
    log('Server JSON', result);
    if (result?.updated && !QUIET_SYNC) {
      ctx.updateBadgeStatus('📡 Synced');
    }
  } catch (error) {
    console.warn(`[${LOG_TAG}] Failed to sync progress`, error);
    ctx.updateBadgeStatus('⚠️ Sync Error', true);
  }
}

export function debouncedSync(percent: number, ctx: SyncContext): void {
  if (syncTimeout) clearTimeout(syncTimeout);
  syncTimeout = setTimeout(() => {
    log('debouncedSync fire', { percent });
    void syncProgress(percent, ctx);
  }, SYNC_DEBOUNCE_MS);
}

export function sendFinal(percent: number, ctx: SyncContext): void {
  try {
    const chapterInfo = parseChapterEnhanced(location.pathname);
    if (!chapterInfo) { log('sendFinal aborted - no chapter'); return; }
    const latestChapterInfo = extractLatestChapterInfo();
    const payload: SyncPayload = {
      user_key: READSYNC_API_KEY,
      device_id: ctx.deviceId,
      device_label: ctx.deviceLabel,
      novel_url: normalizeUrl(location.href),
      percent,
      seconds_on_page: Math.floor((Date.now() - ctx.pageLoadTime) / 1000),
      latest_chapter_num: latestChapterInfo.latestChapterNum,
      latest_chapter_title: latestChapterInfo.latestChapterTitle,
      current_chapter_num: chapterInfo.num,
      current_chapter_source: chapterInfo.source,
    };
    const ok = beaconProgress(payload);
    log('sendBeacon', { ok, percent });
  } catch (e) {
    log('sendFinal error', e);
  }
}

export async function checkForSyncConflict(ctx: SyncContext): Promise<void> {
  const novelId = normalizeNovelId(location.href);
  if (!novelId) return;
  log('compare check', { novelId, deviceId: ctx.deviceId });
  try {
    const result = await compareProgress(novelId, ctx.deviceId);
    log('compare JSON', result);
    if (result.should_prompt_jump && result.global_state) {
      ctx.showSyncBanner(result.global_state);
    }
  } catch (error) {
    console.warn(`[${LOG_TAG}] Failed to check for conflicts`, error);
  }
}

export function startConflictChecker(ctx: SyncContext): void {
  setTimeout(() => {
    void checkForSyncConflict(ctx);
    compareInterval = setInterval(() => { void checkForSyncConflict(ctx); }, COMPARE_CHECK_MS);
    log('conflict checker started', { intervalMs: COMPARE_CHECK_MS });
  }, 1000);
}

export function cleanup(): void {
  if (syncTimeout) clearTimeout(syncTimeout);
  if (compareInterval) clearInterval(compareInterval);
  log('beforeunload cleanup');
}
