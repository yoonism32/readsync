import { afterEach, describe, expect, it, vi } from 'vitest';
import { request, coverUrl, fetchNovels } from './client.js';

afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });

describe('session authenticated API client', () => {
  it('removes legacy credentials and never adds them to request or cover URLs', async () => {
    localStorage.setItem('readsync_api_key', 'old-secret');
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => [] });
    vi.stubGlobal('fetch', fetchMock);
    await request('/novels');
    expect(fetchMock.mock.calls[0][0]).not.toContain('user_key');
    expect(coverUrl('test')).not.toContain('user_key');
    expect(localStorage.getItem('readsync_api_key')).toBeNull();
  });
  it('loads a library larger than the server page size', async () => {
    const page = Array.from({ length: 200 }, (_, i) => ({ novel_id: `n${i}`, title: `Novel ${i}`, latest_global: null, latest_per_device: null }));
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => page })
      .mockResolvedValueOnce({ ok: true, json: async () => [{ ...page[0], novel_id: 'n200' }] });
    vi.stubGlobal('fetch', fetchMock);
    expect(await fetchNovels('/novels')).toHaveLength(201);
    expect(fetchMock.mock.calls[1][0]).toContain('offset=200');
  });
});
