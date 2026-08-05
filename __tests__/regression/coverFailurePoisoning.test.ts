/**
 * Regression test for covers permanently poisoned by a transient fault.
 *
 * The covers route wrote the terminal 'failed' sentinel from the catch block
 * around fetchCoverWithRetry. That helper only *throws* once retries are
 * exhausted on a network error — a genuine upstream 404 returns normally and is
 * handled separately. So the catch path fired on DNS blips, timeouts and egress
 * hiccups, and 'failed' is read as terminal on every later request (the only
 * escape hatch, ?refresh=true, is never sent by the frontend).
 *
 * One bad network moment killed a cover forever. 12 of 132 novels were serving
 * 404 while their source images were still returning 200 with real JPEGs.
 *
 * Only a definitive "this image does not exist upstream" may be terminal.
 */
import { describe, expect, it } from 'vitest';
import { isMissingUpstream } from '../../src/routes/covers.js';

describe('isMissingUpstream', () => {
  it('treats 404 as a definitive missing image', () => {
    expect(isMissingUpstream(404)).toBe(true);
  });

  it('treats 410 Gone as a definitive missing image', () => {
    expect(isMissingUpstream(410)).toBe(true);
  });

  it('does not condemn a cover for a source-side 5xx', () => {
    // The image may well exist; novelarrow was simply unwell.
    expect(isMissingUpstream(500)).toBe(false);
    expect(isMissingUpstream(502)).toBe(false);
    expect(isMissingUpstream(503)).toBe(false);
  });

  it('does not condemn a cover for rate limiting or hotlink blocking', () => {
    // These are the statuses most likely to hit a whole batch at once, which is
    // exactly how you poison a dozen covers in one run.
    expect(isMissingUpstream(429)).toBe(false);
    expect(isMissingUpstream(403)).toBe(false);
  });

  it('does not treat a redirect or a success as missing', () => {
    expect(isMissingUpstream(200)).toBe(false);
    expect(isMissingUpstream(302)).toBe(false);
  });
});
