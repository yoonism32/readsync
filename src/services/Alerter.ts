import {
  ALERT_COOLDOWN_MS,
  ALERT_MAX_PER_HOUR,
  ALERT_WEBHOOK_URL,
  IS_PRODUCTION,
} from '../config.js';
import logger from '../logger.js';

/**
 * Fire-and-forget error alerting over a plain webhook.
 *
 * The roadmap's standing gap was that nothing surfaced an exception outside
 * Render's log tail. Every error in the app already funnels through
 * `handleDbError` and `globalErrorHandler` (src/middleware/errorHandler.ts),
 * so this only needs to hook those two plus the process-level handlers — no
 * SDK, no new dependency, Node's global fetch is enough.
 *
 * ponytail: in-memory dedup state, so it resets on every deploy and is
 * per-process. Move it to a table only if this ever runs multi-instance.
 */
const lastSentAt = new Map<string, number>();
let hourWindowStart = 0;
let sentThisHour = 0;

const HOUR_MS = 60 * 60 * 1000;

/** Stable-ish identity for an error, so a repeat doesn't re-page. */
function fingerprint(err: unknown, context: string): string {
  if (!(err instanceof Error)) return `${context}:${String(err)}`;
  const frame = err.stack?.split('\n')[1]?.trim() ?? '';
  return `${context}:${err.name}:${err.message}:${frame}`;
}

/**
 * Returns false when this alert should be swallowed — either an identical
 * error fired recently, or we've already hit the hourly ceiling. The ceiling
 * matters more than the cooldown: one bad deploy can throw a *different*
 * error on every request, and each one has its own fingerprint.
 */
function shouldSend(key: string, now: number): boolean {
  for (const [oldKey, sentAt] of lastSentAt) {
    if (now - sentAt >= ALERT_COOLDOWN_MS) lastSentAt.delete(oldKey);
  }
  if (now - hourWindowStart >= HOUR_MS) {
    hourWindowStart = now;
    sentThisHour = 0;
  }
  if (sentThisHour >= ALERT_MAX_PER_HOUR) return false;

  const last = lastSentAt.get(key);
  if (last !== undefined && now - last < ALERT_COOLDOWN_MS) return false;

  lastSentAt.set(key, now);
  sentThisHour += 1;
  return true;
}

export interface AlertContext {
  /** Short label for where this came from, e.g. 'db:Get novel statistics'. */
  operation: string;
  [key: string]: unknown;
}

/**
 * Never throws and never rejects — a broken webhook must not become a second
 * error on the request path, or an unhandled rejection that takes the process
 * down through the very handler that reports it.
 */
export function notify(err: unknown, context: AlertContext): void {
  if (!ALERT_WEBHOOK_URL) return;

  const key = fingerprint(err, context.operation);
  if (!shouldSend(key, Date.now())) return;

  const error = err instanceof Error ? err : undefined;
  const payload = {
    service: 'readsync-api',
    environment: IS_PRODUCTION ? 'production' : 'development',
    timestamp: new Date().toISOString(),
    operation: context.operation,
    name: error?.name ?? 'UnknownError',
    message: IS_PRODUCTION
      ? 'Runtime error; inspect server logs'
      : (error?.message ?? String(err)),
    stack: IS_PRODUCTION
      ? undefined
      : error?.stack?.split('\n').slice(0, 8).join('\n'),
    context: IS_PRODUCTION ? { operation: context.operation } : context,
  };

  let host: string;
  try {
    host = new URL(ALERT_WEBHOOK_URL).hostname;
  } catch {
    return;
  }
  const summary = `ReadSync ${payload.environment}: ${context.operation} (${payload.name}). Inspect server logs.`;
  const webhookPayload = ['discord.com', 'discordapp.com'].includes(host)
    ? { content: summary, allowed_mentions: { parse: [] } }
    : host === 'hooks.slack.com'
      ? { text: summary }
      : payload;

  void fetch(ALERT_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(webhookPayload),
    signal: AbortSignal.timeout(5000),
  })
    .then((res) => {
      if (!res.ok) {
        logger.warn(
          { status: res.status, operation: context.operation },
          'Alert webhook rejected the delivery',
        );
      }
    })
    .catch((cause: unknown) => {
      logger.warn({ cause }, 'Alert webhook delivery failed');
    });
}

/** Test seam — the dedup state is module-level and otherwise sticky. */
export function resetAlerterState(): void {
  lastSentAt.clear();
  hourWindowStart = 0;
  sentThisHour = 0;
}
