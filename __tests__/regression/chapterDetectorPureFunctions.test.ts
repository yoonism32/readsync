/**
 * Characterization tests for ChapterDetector.ts's pure (DOM-independent)
 * URL/text parsing functions, written before extracting shared parsing logic
 * out to a module usable by both the userscript and bot/src (which
 * duplicates a "chapter URL -> novel base URL" regex — see NovelScraper.ts).
 * These lock in current behavior so the extraction can't silently change it.
 */
import { describe, it, expect } from 'vitest';
import {
  normalizeUrl,
  normalizeNovelId,
  extractChapterNum,
  extractChapterFromUrl,
  buildChapterPath,
} from '../../userscript/src/services/ChapterDetector.js';

describe('normalizeUrl', () => {
  it('strips a hash fragment', () => {
    expect(normalizeUrl('https://x.com/b/slug/chapter-31#comments')).toBe(
      'https://x.com/b/slug/chapter-31',
    );
  });

  it('normalizes cchapter/chapterN variants to chapter-N', () => {
    expect(normalizeUrl('https://x.com/b/slug/cchapter31')).toBe(
      'https://x.com/b/slug/chapter-31',
    );
  });

  it('leaves an already-normalized URL untouched', () => {
    expect(normalizeUrl('https://x.com/b/slug/chapter-31')).toBe(
      'https://x.com/b/slug/chapter-31',
    );
  });
});

describe('normalizeNovelId', () => {
  it('extracts the slug from a NovelBin /b/ URL', () => {
    expect(normalizeNovelId('https://x.com/b/Shadow-Slave/chapter-31')).toBe(
      'novelbin:shadow-slave',
    );
  });

  it('extracts the slug from a NovelArrow /novel/ URL', () => {
    expect(normalizeNovelId('https://x.com/novel/shadow-slave')).toBe(
      'novelbin:shadow-slave',
    );
  });

  it('extracts the slug from a NovelArrow /chapter/ URL', () => {
    expect(
      normalizeNovelId('https://x.com/chapter/shadow-slave/chapter-215'),
    ).toBe('novelbin:shadow-slave');
  });

  it('returns null for a URL with none of the known segments', () => {
    expect(normalizeNovelId('https://x.com/about')).toBeNull();
  });
});

describe('extractChapterNum', () => {
  it('reads "Chapter N"', () => {
    expect(extractChapterNum('Chapter 215')).toBe(215);
  });

  it('reads "Ch. N"', () => {
    expect(extractChapterNum('Ch. 31')).toBe(31);
  });

  it('reads "#N"', () => {
    expect(extractChapterNum('#42')).toBe(42);
  });

  it('returns null when nothing matches', () => {
    expect(extractChapterNum('nothing here')).toBeNull();
  });

  it('accepts a chapter number above the old 10000 bound (raised to MAX_CHAPTER_NUM)', () => {
    expect(extractChapterNum('Chapter 12345')).toBe(12345);
  });

  it('rejects a number at/above the MAX_CHAPTER_NUM upper bound', () => {
    expect(extractChapterNum('Chapter 999999')).toBeNull();
  });
});

describe('extractChapterFromUrl', () => {
  it('reads a standard chapter-N href', () => {
    expect(extractChapterFromUrl('https://x.com/b/slug/chapter-31')).toBe(31);
  });

  it('reads a number-prefix href with no "chapter" token', () => {
    expect(
      extractChapterFromUrl('https://x.com/b/slug/31-the-beginning'),
    ).toBe(31);
  });

  it('returns null when the last segment has no leading/any number', () => {
    expect(extractChapterFromUrl('https://x.com/novel/slug')).toBeNull();
  });
});

describe('buildChapterPath', () => {
  it('increments a hyphenated chapter-N path', () => {
    expect(buildChapterPath('/b/slug/chapter-31', 'chapter', 32)).toBe(
      '/b/slug/chapter-32',
    );
  });

  it('preserves the cchapter token and no-hyphen format', () => {
    expect(buildChapterPath('/b/slug/cchapter31', 'cchapter', 32)).toBe(
      '/b/slug/cchapter32',
    );
  });
});
