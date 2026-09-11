// Offline sync queue: failed progress syncs are persisted to
// localStorage and replayed in order once the server is reachable.
// Note: the server stamps replayed snapshots with its own NOW(), so a
// replayed entry counts for the day it lands, not the day it was read.

import { postProgress } from '../api/client.js';
import type { SyncPayload } from '../types/index.js';

const QUEUE_KEY = 'readsync_offline_queue';
const MAX_QUEUE_LENGTH = 200;
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const log = (...args: unknown[]) => {
  try { console.debug('[ReadSync:queue]', ...args); } catch { /* */ }
};

interface QueuedSync {
  id?: string;
  payload: SyncPayload;
  queued_at: number;
}

function load(): QueuedSync[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const clean = (parsed as QueuedSync[])
      .filter(entry => entry && entry.payload && typeof entry.queued_at === 'number')
      .map(entry => ({ ...entry, payload: { ...entry.payload, user_key: undefined } }));
    // Remove credentials written by earlier releases even while still offline.
    if (JSON.stringify(clean) !== raw) save(clean);
    return clean;
  } catch {
    return [];
  }
}

function save(queue: QueuedSync[]): void {
  try {
    if (queue.length === 0) localStorage.removeItem(QUEUE_KEY);
    else localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch (e) {
    log('save failed (quota/private mode?)', e);
  }
}

const fresh = (q: QueuedSync[], now: number): QueuedSync[] =>
  q.filter(entry => now - entry.queued_at <= MAX_AGE_MS);

export function queueSize(): number {
  return fresh(load(), Date.now()).length;
}

/** Persist a failed sync. Keeps at most one entry per novel+chapter
 *  (latest wins — an old lower percent for the same chapter is useless),
 *  capped at MAX_QUEUE_LENGTH with oldest entries dropped first. */
export function enqueue(payload: SyncPayload): number {
  const now = Date.now();
  const key = (p: SyncPayload) => `${p.novel_url}|${p.current_chapter_num ?? ''}`;
  let queue = fresh(load(), now).filter(e => key(e.payload) !== key(payload));
  queue.push({ id: crypto.randomUUID(), payload: { ...payload, user_key: undefined }, queued_at: now });
  if (queue.length > MAX_QUEUE_LENGTH) queue = queue.slice(-MAX_QUEUE_LENGTH);
  save(queue);
  log('enqueued', { size: queue.length });
  return queue.length;
}

let flushing = false;

/** Replay queued syncs in order. Stops at the first network failure and
 *  keeps the remainder for the next attempt. Returns entries removed
 *  from the queue (synced or dropped as permanently rejected). */
export async function flushQueue(): Promise<number> {
  if (flushing) return 0;
  flushing = true;
  try {
    const now = Date.now();
    const queue = fresh(load(), now);
    if (queue.length === 0) {
      save([]);
      return 0;
    }

    let synced = 0;
    for (const entry of queue) {
      try {
        await postProgress(entry.payload);
        synced++;
      } catch (e) {
        // Server-side rejections (4xx) won't succeed on retry — drop them.
        const msg = e instanceof Error ? e.message : '';
        if (/^HTTP (400|404|410|413|422)\b/.test(msg)) {
          log('dropping rejected entry', msg);
          synced++;
          continue;
        }
        break;
      }
    }

    // Reload after awaits: a scroll event may have queued a newer snapshot.
    const removed = new Set(queue.slice(0, synced).map(entry => JSON.stringify(entry)));
    save(fresh(load(), Date.now()).filter(entry => !removed.has(JSON.stringify(entry)))
      .map(entry => ({ ...entry, payload: { ...entry.payload, user_key: undefined } })));
    if (synced > 0) log('flushed', { synced, remaining: queue.length - synced });
    return synced;
  } finally {
    flushing = false;
  }
}
