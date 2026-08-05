/**
 * Regression test for covers that can never be mirrored from the server.
 *
 * images.novelarrow.com sits behind Cloudflare and returns 403 to Render's
 * datacenter egress. The same URLs return 200 from a residential connection,
 * and no combination of User-Agent, Referer or Sec-Fetch-* headers changes it —
 * it is pure IP reputation. The source also sends no CORS headers and public
 * image proxies are blocked too, so the server has no route to the bytes at all.
 *
 * The browser does. So when mirroring is impossible we redirect to the source
 * and let the reader's own connection fetch it, rather than reporting a 404 for
 * an image that plainly exists.
 *
 * The cooldown exists because that 403 is persistent, not transient: without it
 * every Explorer render re-attempts a dozen doomed mirrors, each burning three
 * retries and ~3.5s of backoff.
 */
import { describe, expect, it } from 'vitest';
import {
  MIRROR_RETRY_COOLDOWN_MS,
  isMirrorOnCooldown,
  sourceCoverUrl,
} from '../../src/routes/covers.js';

describe('sourceCoverUrl', () => {
  it('strips the novelbin: prefix the ids still carry', () => {
    expect(sourceCoverUrl('novelbin:nine-star-hegemon-body-arts')).toBe(
      'https://images.novelarrow.com/novel/nine-star-hegemon-body-arts.jpg',
    );
  });

  it('leaves an unprefixed id alone', () => {
    expect(sourceCoverUrl('shadow-slave')).toBe(
      'https://images.novelarrow.com/novel/shadow-slave.jpg',
    );
  });

  it('only strips the prefix at the start', () => {
    // A slug that merely contains the word must not be mangled.
    expect(sourceCoverUrl('novelbin:a-novelbin:story')).toBe(
      'https://images.novelarrow.com/novel/a-novelbin:story.jpg',
    );
  });
});

describe('isMirrorOnCooldown', () => {
  const now = 1_700_000_000_000;

  it('is not on cooldown when nothing has failed yet', () => {
    expect(isMirrorOnCooldown(undefined, now)).toBe(false);
  });

  it('is on cooldown while the retry time is still in the future', () => {
    expect(isMirrorOnCooldown(now + 60_000, now)).toBe(true);
  });

  it('lets the mirror be retried once the cooldown has elapsed', () => {
    expect(isMirrorOnCooldown(now - 1, now)).toBe(false);
    expect(isMirrorOnCooldown(now, now)).toBe(false);
  });

  it('uses a cooldown long enough to survive a browsing session', () => {
    // A full page of covers must not re-trigger a dozen doomed fetches.
    expect(MIRROR_RETRY_COOLDOWN_MS).toBeGreaterThanOrEqual(60 * 60 * 1000);
  });
});
