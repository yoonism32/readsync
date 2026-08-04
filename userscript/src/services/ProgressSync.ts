import { READSYNC_API_KEY, SYNC_DEBOUNCE_MS, COMPARE_CHECK_MS, QUIET_SYNC } from '../config.js';
import { postProgress, beaconProgress, compareProgress, postReread } from '../api/client.js';
import { showPeekBanner } from './UIManager.js';
import { enqueue, flushQueue, queueSize } from './OfflineQueue.js';
import { parseChapterEnhanced, extractLatestChapterInfo, normalizeUrl, normalizeNovelId, isChapterPath } from './ChapterDetector.js';
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
  return isChapterPath(location.pathname);
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
    if (result?.auto_reread) {
      ctx.updateBadgeStatus('🔁 Re-read started');
    }
    // Quiet peek: the server kept the bookmark where it was because
    // we're on an earlier chapter. Offer an explicit re-read instead.
    if (result && !result.updated && result.rejected_reason === 'behind_chapter') {
      const novelId = normalizeNovelId(location.href);
      if (novelId) {
        showPeekBanner(novelId, () => {
          void postReread(novelId)
            .then(() => {
              ctx.updateBadgeStatus('🔁 Re-read started');
              void syncProgress(percent, ctx);
            })
            .catch(() => ctx.updateBadgeStatus('⚠️ Re-read failed', true));
        });
      }
    }
    // Back online — drain anything queued while offline.
    if (queueSize() > 0) {
      const drained = await flushQueue();
      if (drained > 0) ctx.updateBadgeStatus(`📡 Synced +${drained} queued`);
    }
  } catch (error) {
    // Server rejections (4xx) are policy, not connectivity — don't queue.
    const msg = error instanceof Error ? error.message : '';
    if (/^HTTP 4\d\d/.test(msg)) {
      console.warn(`[${LOG_TAG}] Sync rejected`, error);
      ctx.updateBadgeStatus('⚠️ Sync Error', true);
      return;
    }
    const size = enqueue(payload);
    console.warn(`[${LOG_TAG}] Offline — sync queued`, error);
    ctx.updateBadgeStatus(`📴 ${size} queued`, true);
  }
}

/** Replay any offline-queued syncs; called on boot and when the browser
 *  reports connectivity is back. */
export async function drainOfflineQueue(ctx: SyncContext): Promise<void> {
  if (queueSize() === 0) return;
  const drained = await flushQueue();
  if (drained > 0) ctx.updateBadgeStatus(`📡 Synced ${drained} queued`);
  const remaining = queueSize();
  if (remaining > 0) ctx.updateBadgeStatus(`📴 ${remaining} queued`, true);
}

export function debouncedSync(percent: number, ctx: SyncContext): void {
  if (syncTimeout) clearTimeout(syncTimeout);
  const scheduledPath = location.pathname;
  syncTimeout = setTimeout(() => {
    // The payload reads location.href at fire time; if an SPA navigation
    // happened since scheduling, this percent belongs to the old chapter
    // and must not be attributed to the new URL.
    if (location.pathname !== scheduledPath) {
      log('debouncedSync dropped — URL changed since scheduling', { scheduledPath, now: location.pathname });
      return;
    }
    log('debouncedSync fire', { percent });
    void syncProgress(percent, ctx);
  }, SYNC_DEBOUNCE_MS);
}

/**
 * Cancel a pending debounced sync. Must be called on SPA chapter navigation:
 * the debounce payload reads location.href at fire time, so a sync scheduled
 * on the old chapter would attribute its percent to the new chapter's URL.
 */
export function cancelPendingSync(): void {
  if (syncTimeout) { clearTimeout(syncTimeout); syncTimeout = null; }
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
  cancelPendingSync();
  if (compareInterval) clearInterval(compareInterval);
  log('beforeunload cleanup');
}
