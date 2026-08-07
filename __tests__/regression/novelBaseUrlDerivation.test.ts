/**
 * Parity test between the two independent "chapter URL -> novel base URL"
 * derivations: userscript/src/services/ChapterDetector.ts's
 * deriveNovelBaseUrl (browser context) and bot/src/parseNovelInfo.ts's
 * deriveNovelBaseUrl (Node/regex-on-string context, used by NovelScraper.ts).
 *
 * They can't share a single module without new cross-package build tooling
 * (see the comments on both functions), so this test locks in where they
 * currently agree and documents the one known gap: the bot's version has no
 * fallback for NovelBin's number-prefix chapter URLs
 * (/b/<slug>/31-the-beginning), so it does not strip that suffix the way
 * the userscript's version does. That gap is pre-existing, not introduced
 * by this test, and is low-impact today since the bot is intentionally
 * disabled in production (see docs/ARCHITECTURE.md).
 */
import { describe, it, expect } from 'vitest';
import { deriveNovelBaseUrl as deriveUserscript } from '../../userscript/src/services/ChapterDetector.js';
import { deriveNovelBaseUrl as deriveBot } from '../../bot/src/parseNovelInfo.js';

describe('deriveNovelBaseUrl — agreement between userscript and bot', () => {
  it('agree on a NovelArrow chapter URL', () => {
    const url = 'https://novelarrow.com/chapter/shadow-slave/chapter-215-the-end';
    const expected = 'https://novelarrow.com/novel/shadow-slave';
    expect(deriveUserscript(url)).toBe(expected);
    expect(deriveBot(url)).toBe(expected);
  });

  it('agree on a NovelBin chapter-N suffix URL', () => {
    const url = 'https://novelbin.com/b/shadow-slave/chapter-31';
    const expected = 'https://novelbin.com/b/shadow-slave';
    expect(deriveUserscript(url)).toBe(expected);
    expect(deriveBot(url)).toBe(expected);
  });

  it('agree on a cchapter-N suffix URL', () => {
    const url = 'https://novelbin.com/b/shadow-slave/cchapter31';
    const expected = 'https://novelbin.com/b/shadow-slave';
    expect(deriveUserscript(url)).toBe(expected);
    expect(deriveBot(url)).toBe(expected);
  });
});

describe('deriveNovelBaseUrl — known divergence (documented, not fixed here)', () => {
  it('userscript strips a NovelBin number-prefix chapter suffix; bot does not', () => {
    const url = 'https://novelbin.com/b/shadow-slave/31-the-beginning';

    expect(deriveUserscript(url)).toBe('https://novelbin.com/b/shadow-slave');
    // Bot's simpler regex only handles chapter-N/cchapterN suffixes, so a
    // bare number-prefix chapter URL passes through unchanged.
    expect(deriveBot(url)).toBe(url);
  });
});
