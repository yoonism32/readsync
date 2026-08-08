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
export const COMPARE_CHECK_MS = 2000;   // Check for conflicts every 2s (more frequent)
// Scroll position right after landing on a chapter can be transiently wrong
// (site-side scroll-restoration quirks, lazy-loaded content still shifting
// scrollHeight) — ignore scroll-driven syncs until this much time has passed.
export const CHAPTER_GRACE_MS = 5000;

/* ===== ReadSync API ===== */
// const READSYNC_API_BASE = 'http://localhost:3000/api/v1';
// const READSYNC_API_BASE = 'http://192.168.0.15:3000/api/v1';
export const READSYNC_API_BASE = 'https://readsync-n7zp.onrender.com/api/v1';
export const READSYNC_API_KEY = 'demo-api-key-12345';
