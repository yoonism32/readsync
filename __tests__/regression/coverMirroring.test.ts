/**
 * Regression test for covers that never get mirrored.
 *
 * novels.cover_img has two writers: this route (which mirrors the image into
 * our bucket and stores our own URL) and the admin auto-update (which stamps
 * the scraped images.novelarrow.com URL whenever the column is NULL or
 * 'failed'). The route short-circuited on *any* cached URL, so whichever wrote
 * first won permanently — 13 of 132 novels were still hotlinking the source
 * because the userscript refreshed them before anyone viewed the cover.
 */
import { describe, it, expect } from 'vitest';
import { isMirroredCover } from '../../src/routes/covers.js';

const MIRRORED =
  'https://hzziccyyziljuqxuzxrl.supabase.co/storage/v1/object/public/novel-covers/all-milfs-are-mine.jpg';

describe('isMirroredCover', () => {
  it('treats our own bucket URL as mirrored', () => {
    expect(isMirroredCover(MIRRORED)).toBe(true);
  });

  it('does not treat a novelarrow source URL as mirrored', () => {
    expect(
      isMirroredCover('https://images.novelarrow.com/novel/i-can-upgrade-everything-infinitely.jpg'),
    ).toBe(false);
  });

  it('does not treat a novelbin source URL as mirrored', () => {
    expect(isMirroredCover('https://images.novelbin.com/novel/shadow-slave.jpg')).toBe(false);
  });

  it('handles null and the failed sentinel', () => {
    expect(isMirroredCover(null)).toBe(false);
    expect(isMirroredCover('failed')).toBe(false);
    expect(isMirroredCover('')).toBe(false);
  });

  it('is not fooled by a source URL that merely mentions the bucket name', () => {
    expect(isMirroredCover('https://evil.example.com/novel-covers/x.jpg')).toBe(false);
  });
});
