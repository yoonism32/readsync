import { describe, expect, it } from 'vitest';
import { isReaderChapterUrl } from '../../src/services/ReaderUrl.js';

describe('isReaderChapterUrl', () => {
  it('accepts supported NovelArrow and NovelBin chapter URLs', () => {
    expect(
      isReaderChapterUrl('https://novelarrow.com/chapter/shadow-slave/chapter-215-the-end'),
    ).toBe(true);
    expect(
      isReaderChapterUrl(
        'https://novelarrow.com/chapter/my-medical-skills/chapter-auto-282-auto-282-title',
      ),
    ).toBe(true);
    expect(isReaderChapterUrl('https://novelbin.com/b/shadow-slave/chapter-31')).toBe(true);
    expect(isReaderChapterUrl('https://novelbin.com/b/shadow-slave/31-the-beginning')).toBe(true);
  });

  it('rejects NovelArrow landing pages, even when their slugs contain digits', () => {
    expect(
      isReaderChapterUrl(
        'https://novelarrow.com/novel/everyones-class-one-effort-10000x-bonus-reward',
      ),
    ).toBe(false);
    expect(
      isReaderChapterUrl(
        'https://novelarrow.com/chapter/everyones-class-one-effort-10000x-bonus-reward',
      ),
    ).toBe(false);
  });
});
