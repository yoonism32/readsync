import { LOCKOUT_DURATION_MS, MAX_LOGIN_ATTEMPTS } from '../config.js';

/** In-memory per-IP login attempt tracker with automatic stale-entry cleanup. */
const attempts = new Map<string, number[]>();

// Purge stale IPs every 30 minutes to prevent unbounded growth.
setInterval(
  () => {
    const cutoff = Date.now() - LOCKOUT_DURATION_MS;
    for (const [ip, times] of attempts) {
      const fresh = times.filter((t) => t > cutoff);
      if (fresh.length === 0) {
        attempts.delete(ip);
      } else {
        attempts.set(ip, fresh);
      }
    }
  },
  30 * 60 * 1000,
).unref();

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number; // Unix timestamp in seconds
}

export function checkRateLimit(ip: string): RateLimitResult {
  const now = Date.now();
  const times = attempts.get(ip) ?? [];
  const recent = times.filter((t) => now - t < LOCKOUT_DURATION_MS);
  attempts.set(ip, recent);

  const allowed = recent.length < MAX_LOGIN_ATTEMPTS;
  const remaining = Math.max(0, MAX_LOGIN_ATTEMPTS - recent.length);
  const oldest = recent[0] ?? now;
  const resetAt = Math.ceil((oldest + LOCKOUT_DURATION_MS) / 1000);

  return { allowed, remaining, resetAt };
}

export function recordAttempt(ip: string): void {
  const times = attempts.get(ip) ?? [];
  times.push(Date.now());
  attempts.set(ip, times);
}

export function clearAttempts(ip: string): void {
  attempts.delete(ip);
}
