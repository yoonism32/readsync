export const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;   // 6 hours between full cycles
export const BATCH_SIZE = 5;                               // Check 5 novels at a time
export const BATCH_INTERVAL_MS = 30 * 60 * 1000;          // 30 minutes between batches
export const STALE_THRESHOLD_HOURS = 24;                   // Update if not checked in 24 hours

// Error management constants
export const MAX_ERRORS = 100;
export const RETAIN_ERRORS = 50;

// Timeout constants
export const BROWSER_TIMEOUT_MS = 60_000;             // 60 seconds timeout for browser operations
export const CLOUDFLARE_WAIT_MS = 8_000;              // 8 seconds wait for Cloudflare challenge
export const GRACEFUL_SHUTDOWN_WAIT_SECONDS = 60;

export const MIN_GLOBAL_GAP_MS = 10_000;              // 10 seconds between requests
export const COOLDOWN_403_MS = 6 * 60 * 60 * 1000;   // 6 hours hard block on 403
export const COOLDOWN_429_MS = 30 * 60 * 1000;        // 30 min cooldown on 429
