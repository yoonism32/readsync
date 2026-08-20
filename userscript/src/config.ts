'use strict';

/* ===== Navigation / Scroll settings ===== */
export const STEP = 60;
export const AUTO_PIX = 6;
export const AUTO_MS = 20;

/* ===== Progress display ===== */
export const PCT_DECIMALS = 1;
export const BADGE_AUTOHIDE_MS = 2500;

/* ===== Restore-banner logic ===== */
export const RESTORE_LIMIT = 90;        // restore if <90%, clear if ≥90
export const BANNER_SHOW_MAX_PCT = 10;  // show restore banner only if current scroll ≤ 10%
export const IGNORE_LOW_PCT = 1;        // ignore saving tiny noise at very top

/* ===== Sync behaviour ===== */
export const QUIET_SYNC = true;         // silent on successful syncs; still shows errors
export const SYNC_DEBOUNCE_MS = 500;    // Wait 0.5s before syncing progress (much faster)
export const COMPARE_CHECK_MS = 20000;  // Check for conflicts every 20s — this is a
                                         // perpetual poll for as long as a chapter/novel
                                         // tab stays open (paused while hidden, see
                                         // ProgressSync.ts), so it must stay well above
                                         // "instant"; a cross-device jump prompt doesn't
                                         // need sub-second freshness.
// Scroll-driven syncs can be delayed or missed (e.g. a backgrounded window's
// scroll/timer delivery), leaving the Dashboard stuck on a stale percent
// with no self-correction. The 20s compare tick above already fetches this
// device's last-synced percent — if the live DOM position is more than this
// far ahead, push it too, piggybacking on the existing interval instead of
// adding a new one. Keep it above scroll jitter/rounding noise.
export const HEARTBEAT_SYNC_MIN_DELTA_PCT = 2;
// Scroll position right after landing on a chapter can be transiently wrong
// (site-side scroll-restoration quirks, lazy-loaded content still shifting
// scrollHeight) — ignore scroll-driven syncs until this much time has passed.
export const CHAPTER_GRACE_MS = 5000;
// The completion fast-path (>= RESTORE_LIMIT) re-fires on every scroll tick
// that nudges percent upward, un-debounced — necessary so 90% -> 100% each
// get their own high-water-mark sync (see lastCompletionSynced in main.ts),
// but sub-percent scroll ticks meant dozens of near-duplicate syncs per
// chapter. Confirmed in the 2026-08-20 egress incident: one device alone
// produced 11,129 syncs in 24h, 39% of them (4,378) already >=90% re-firing
// against another >=90% ping. Throttling to this delta collapses that tail
// to roughly 5 syncs per chapter instead of dozens; the true final position
// on leaving the chapter is still captured independently by sendFinal's
// unload beacon, so nothing is lost — just de-spammed.
export const COMPLETION_SYNC_MIN_DELTA_PCT = 2;

/* ===== Latest-chapter detection ===== */
// "Next Chapter" nav links (and similar nearby-chapter widgets) put a
// chapter page's locally-detected max a few numbers above whatever chapter
// the reader is currently on — never near the novel's true latest release.
// Treating that as "good enough" without confirming against the novel's
// main page is what let a 656-chapter local read mask a true latest of 669
// (2026-08-12 incident, eternal-life-by-daily-divination). This narrows
// that failure window rather than eliminating it: any nav pattern jumping
// further ahead than this would reproduce it.
export const CHAPTER_PAGE_NAV_LOOKAHEAD = 5;

// Sanity-check upper bound for a parsed chapter NUMBER (extractChapterNum,
// extractChapterFromUrl, getCurrentChapterFromContent, parseChapterEnhanced)
// — rejects obvious garbage matches (a stray 4/5-digit ID or year caught by
// a loose regex), not a real ceiling on novel length. The longest tracked
// novel today is ~7,600 chapters; this was previously hardcoded at 10,000,
// which would have silently dropped detection for any novel that crossed
// it. Kept well above any real web novel's length rather than raised to
// match "whatever the current max is" again.
export const MAX_CHAPTER_NUM = 100000;

/* ===== ReadSync API ===== */
// const READSYNC_API_BASE = 'http://localhost:3000/api/v1';
// const READSYNC_API_BASE = 'http://192.168.0.15:3000/api/v1';
export const READSYNC_API_BASE = 'https://readsync-n7zp.onrender.com/api/v1';
export const READSYNC_API_KEY = 'demo-api-key-12345';
