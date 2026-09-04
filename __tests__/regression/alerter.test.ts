import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Alerter reads its config at module load, so each case re-imports the module
 * with the env it wants rather than mutating a already-bound constant.
 */
async function loadAlerter(env: Record<string, string | undefined>) {
  vi.resetModules();
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  return import('../../src/services/Alerter.js');
}

const WEBHOOK = 'https://example.invalid/hook';

describe('Alerter', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    process.env = { ...originalEnv };
  });

  it('does nothing when ALERT_WEBHOOK_URL is unset', async () => {
    const { notify } = await loadAlerter({ ALERT_WEBHOOK_URL: undefined });
    notify(new Error('boom'), { operation: 'db:test' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts one alert for an error', async () => {
    const { notify } = await loadAlerter({ ALERT_WEBHOOK_URL: WEBHOOK });
    notify(new Error('boom'), { operation: 'db:test' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(WEBHOOK);
    const body = JSON.parse((init as { body: string }).body);
    expect(body.message).toBe('boom');
    expect(body.operation).toBe('db:test');
  });

  // The whole point of the dedup: a route that throws on every request must
  // not turn into one webhook delivery per request. Each call constructs a
  // *fresh* Error from the same throw site, which is what actually happens in
  // production — reusing one Error object would pass trivially and prove
  // nothing about the fingerprint.
  it('suppresses repeat throws from the same site inside the cooldown', async () => {
    const { notify } = await loadAlerter({ ALERT_WEBHOOK_URL: WEBHOOK });
    const throwSite = () => new Error('boom');
    notify(throwSite(), { operation: 'db:test' });
    notify(throwSite(), { operation: 'db:test' });
    notify(throwSite(), { operation: 'db:test' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('still sends a different error from the same operation', async () => {
    const { notify } = await loadAlerter({ ALERT_WEBHOOK_URL: WEBHOOK });
    notify(new Error('boom'), { operation: 'db:test' });
    notify(new Error('different'), { operation: 'db:test' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  // A bad deploy can throw a *distinct* error per request, so the per-error
  // cooldown alone would not hold the volume down — the hourly cap does.
  it('stops at the hourly ceiling even for distinct errors', async () => {
    const { notify } = await loadAlerter({
      ALERT_WEBHOOK_URL: WEBHOOK,
      ALERT_MAX_PER_HOUR: '3',
    });
    for (let i = 0; i < 10; i++) {
      notify(new Error(`boom ${i}`), { operation: 'db:test' });
    }
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('swallows a failing webhook rather than throwing', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));
    const { notify } = await loadAlerter({ ALERT_WEBHOOK_URL: WEBHOOK });
    expect(() => notify(new Error('boom'), { operation: 'db:test' })).not.toThrow();
  });

  it('handles a non-Error thrown value', async () => {
    const { notify } = await loadAlerter({ ALERT_WEBHOOK_URL: WEBHOOK });
    notify('just a string', { operation: 'db:test' });
    const body = JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body);
    expect(body.message).toBe('just a string');
    expect(body.name).toBe('UnknownError');
  });
});
