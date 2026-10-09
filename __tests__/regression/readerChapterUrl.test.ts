import { describe, expect, it } from 'vitest';
import {
  isReaderChapterUrl,
  isReaderCoverUrl,
  isReaderUrl,
} from '../../src/services/ReaderUrl.js';

// NovelPing serves both /novel/<slug>[/chapter-N...] and /book/<slug>[/chapter-N...]
// (docs/NOVELPING_MIGRATION.md). NovelArrow stays supported alongside it.
describe('NovelPing support (additive)', () => {
  it('accepts novelping.com as a reader host', () => {
    expect(isReaderUrl('https://novelping.com/book/shadow-slave')).toBe(true);
    expect(isReaderUrl('https://novelping.com/novel/shadow-slave')).toBe(true);
    expect(isReaderUrl('https://www.novelping.com/book/shadow-slave')).toBe(true);
    expect(isReaderUrl('http://novelping.com/book/shadow-slave')).toBe(false);
  });

  it.each([
    'https://novelping.com/book/nine-star-hegemon-body-arts/chapter-7268-leaving',
    'https://novelping.com/book/supreme-magus-novel/chapter-2',
    'https://novelping.com/novel/supreme-magus-novel/chapter-2',
    'https://novelping.com/novel/sample-devour-sss-talents/chapter-1-the-second-failure',
    // NovelArrow's "auto-<N>" numbering carries over (57 stored snapshots use it; served directly)
    'https://novelping.com/novel/sample-skills/chapter-auto-282-auto-282-145-soaring-to-the-skies',
  ])('accepts NovelPing chapter URL %s', (url) => {
    expect(isReaderChapterUrl(url)).toBe(true);
  });

  it.each([
    'https://novelping.com/book/nine-star-hegemon-body-arts',
    'https://novelping.com/novel/nine-star-hegemon-body-arts',
    'https://novelping.com/book/sample-class-one-effort-10000x-bonus',
    'https://novelping.com/novel/sample-class-one-effort-10000x-bonus',
    // /chapter/<slug>/... is a 404 on NovelPing, so it is not a valid reader URL there
    'https://novelping.com/chapter/shadow-slave/chapter-215-the-end',
  ])('rejects NovelPing non-chapter URL %s', (url) => {
    expect(isReaderChapterUrl(url)).toBe(false);
  });

  it('accepts NovelPing cover URLs (with the ?v= cache suffix) and nothing else on look-alike hosts', () => {
    expect(isReaderCoverUrl('https://images.novelping.com/novel/supreme-magus-novel.jpg?v=1790072278157')).toBe(true);
    expect(isReaderCoverUrl('https://images.novelping.com.evil.com/novel/x.jpg')).toBe(false);
    expect(isReaderCoverUrl('https://images.novelarrow.com/novel/x.jpg')).toBe(true);
  });
});

describe('isReaderChapterUrl', () => {
  it('accepts supported NovelArrow and NovelBin chapter URLs', () => {
    expect(
      isReaderChapterUrl('https://novelarrow.com/chapter/shadow-slave/chapter-215-the-end'),
    ).toBe(true);
    expect(
      isReaderChapterUrl(
        'https://novelarrow.com/chapter/sample-skills/chapter-auto-282-auto-282-title',
      ),
    ).toBe(true);
    expect(isReaderChapterUrl('https://novelbin.com/b/shadow-slave/chapter-31')).toBe(true);
    expect(isReaderChapterUrl('https://novelbin.com/b/shadow-slave/31-the-beginning')).toBe(true);
  });

  it('rejects NovelArrow landing pages, even when their slugs contain digits', () => {
    expect(
      isReaderChapterUrl(
        'https://novelarrow.com/novel/sample-class-one-effort-10000x-bonus',
      ),
    ).toBe(false);
    expect(
      isReaderChapterUrl(
        'https://novelarrow.com/chapter/sample-class-one-effort-10000x-bonus',
      ),
    ).toBe(false);
  });
});
