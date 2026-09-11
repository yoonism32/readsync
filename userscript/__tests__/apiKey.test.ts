import { afterEach, expect, it, vi } from 'vitest';
import { compareProgress, postReread, postProgress, beaconProgress, postAutoUpdate, postCoverUpload } from '../src/api/client.js';
vi.mock('../src/config.js', () => ({ READSYNC_API_BASE: 'https://example.test/api/v1', getApiKey: () => 'fixture-key' }));
afterEach(() => vi.unstubAllGlobals());
it('includes both modern and legacy credentials on every request', async () => {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
  vi.stubGlobal('fetch', fetchMock);
  await compareProgress('novel', 'device');
  await postReread('novel');
  await postProgress({} as never);
  beaconProgress({} as never);
  await postAutoUpdate({} as never);
  await postCoverUpload('novel', 'bytes', 'image/jpeg');
  expect(fetchMock).toHaveBeenCalledTimes(6);
  for (const [url, options] of fetchMock.mock.calls) {
    expect(options.headers.Authorization).toBe('Bearer fixture-key');
    if (options.body) expect(JSON.parse(options.body).user_key).toBe('fixture-key');
    else expect(new URL(url).searchParams.get('user_key')).toBe('fixture-key');
  }
});
