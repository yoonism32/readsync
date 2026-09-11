import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { enqueue, flushQueue, queueSize } from '../src/services/OfflineQueue.js';
import { postProgress } from '../src/api/client.js';
import type { SyncPayload } from '../src/types/index.js';
vi.mock('../src/api/client.js', () => ({ postProgress: vi.fn() }));

const payload = (chapter: number): SyncPayload => ({
  user_key: 'must-not-persist', device_id: 'test', device_label: 'Test',
  novel_url: `https://novelarrow.com/novel/test/chapter-${chapter}`, percent: 50,
  current_chapter_num: chapter, current_chapter_source: 'url', latest_chapter_num: null,
  latest_chapter_title: null, latest_chapter_verified: false, seconds_on_page: 10,
});
let storage: Map<string, string>;
beforeEach(() => {
  storage = new Map();
  vi.stubGlobal('localStorage', { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => storage.set(k, v), removeItem: (k: string) => storage.delete(k) });
  vi.mocked(postProgress).mockReset();
});
afterEach(() => vi.unstubAllGlobals());

describe('offline queue security and races', () => {
  it('never persists the supplied credential', () => {
    enqueue(payload(1));
    expect([...storage.values()].join()).not.toContain('must-not-persist');
  });
  it('retains an entry enqueued while an earlier request is pending', async () => {
    let complete!: () => void;
    vi.mocked(postProgress).mockImplementationOnce(() => new Promise(resolve => { complete = () => resolve({ updated: true }); }));
    enqueue(payload(1));
    const flushing = flushQueue();
    enqueue(payload(2));
    complete();
    expect(await flushing).toBe(1);
    expect(queueSize()).toBe(1);
  });
  it.each([401, 403, 429, 500])('retains retryable HTTP %s failures', async status => {
    enqueue(payload(1));
    vi.mocked(postProgress).mockRejectedValue(new Error(`HTTP ${status}`));
    expect(await flushQueue()).toBe(0);
    expect(queueSize()).toBe(1);
  });
  it('drops a permanently invalid record', async () => {
    enqueue(payload(1));
    vi.mocked(postProgress).mockRejectedValue(new Error('HTTP 400'));
    expect(await flushQueue()).toBe(1);
    expect(queueSize()).toBe(0);
  });
});
