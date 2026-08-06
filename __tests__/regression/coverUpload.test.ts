/**
 * Regression tests for userscript-assisted cover uploads.
 *
 * images.novelarrow.com blocks Render's datacenter egress with a 403 that
 * never resolves server-side (see coverSourceFallback.test.ts). The
 * userscript runs on the reader's own residential IP and can fetch the
 * bytes via GM_xmlhttpRequest, then POST them here so a real mirrored copy
 * lands in the bucket instead of the browser hotlinking the source forever.
 *
 * The upload payload is client-supplied, so two things matter: never trust
 * the claimed content-type over the actual bytes (a stale/garbage response
 * body written to a *public* bucket gets served to every reader), and never
 * let the size bounds admit either an empty write or something that could
 * exhaust request-handling resources.
 */
import { describe, expect, it } from 'vitest';
import {
  MAX_COVER_UPLOAD_BYTES,
  MIN_COVER_UPLOAD_BYTES,
  isJpegMagicBytes,
  isValidCoverUploadSize,
  normalizeSlug,
} from '../../src/routes/covers.js';

describe('normalizeSlug', () => {
  it('strips the novelbin: prefix the ids still carry', () => {
    expect(normalizeSlug('novelbin:nine-star-hegemon-body-arts')).toBe(
      'nine-star-hegemon-body-arts',
    );
  });

  it('leaves an unprefixed id alone', () => {
    expect(normalizeSlug('shadow-slave')).toBe('shadow-slave');
  });

  it('only strips the prefix at the start', () => {
    expect(normalizeSlug('novelbin:a-novelbin:story')).toBe('a-novelbin:story');
  });
});

describe('isJpegMagicBytes', () => {
  it('accepts a real JPEG SOI marker', () => {
    expect(isJpegMagicBytes(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]))).toBe(true);
  });

  it('rejects a PNG header', () => {
    expect(isJpegMagicBytes(Buffer.from([0x89, 0x50, 0x4e, 0x47]))).toBe(false);
  });

  it('rejects an empty buffer', () => {
    expect(isJpegMagicBytes(Buffer.alloc(0))).toBe(false);
  });

  it('rejects a buffer shorter than the marker', () => {
    expect(isJpegMagicBytes(Buffer.from([0xff, 0xd8]))).toBe(false);
  });

  it('rejects an HTML error page mistakenly uploaded as an image', () => {
    expect(isJpegMagicBytes(Buffer.from('<html><body>403</body></html>'))).toBe(false);
  });
});

describe('isValidCoverUploadSize', () => {
  it('rejects a payload one byte under the floor', () => {
    expect(isValidCoverUploadSize(MIN_COVER_UPLOAD_BYTES - 1)).toBe(false);
  });

  it('accepts the floor itself', () => {
    expect(isValidCoverUploadSize(MIN_COVER_UPLOAD_BYTES)).toBe(true);
  });

  it('accepts a typical cover size', () => {
    expect(isValidCoverUploadSize(80 * 1024)).toBe(true);
  });

  it('accepts the ceiling itself', () => {
    expect(isValidCoverUploadSize(MAX_COVER_UPLOAD_BYTES)).toBe(true);
  });

  it('rejects a payload one byte over the ceiling', () => {
    expect(isValidCoverUploadSize(MAX_COVER_UPLOAD_BYTES + 1)).toBe(false);
  });
});
