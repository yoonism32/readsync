/**
 * Regression tests for the novelbin.com -> novelarrow.com migration's URL
 * grammar change (/b/<slug> -> /novel/<slug>,
 * /b/<slug>/chapter-N -> /chapter/<slug>/chapter-N-<title>), covering the
 * shared URL-handling functions in NovelService.ts.
 */
import { describe, it, expect } from 'vitest';
import {
  deriveNovelMainUrl,
  extractNovelTitle,
  healDeadSiteUrl,
  normalizeNovelId,
  parseChapterFromUrl,
} from '../../src/services/NovelService.js';

// The parseNovelInfoFromHTML (bot/src/parseNovelInfo.ts) describe blocks that
// used to live here were removed with the bot (2026-09-08, never ran in
// production — see docs/ARCHITECTURE.md). That was server-side HTML-string
// parsing exclusive to the bot; the userscript does its own DOM-based
// extraction (extractSynopsis() etc. in PageMetadata) with separate tests,
// not against these same fixtures.

describe('normalizeNovelId — both URL grammars map to the same legacy ID', () => {
  it.each([
    ['https://novelbin.com/b/shadow-slave', 'novelbin:shadow-slave'],
    ['https://novelbin.com/b/shadow-slave/chapter-100', 'novelbin:shadow-slave'],
    ['https://novelarrow.com/novel/shadow-slave', 'novelbin:shadow-slave'],
    ['https://novelarrow.com/chapter/shadow-slave/chapter-10-first-man-down', 'novelbin:shadow-slave'],
    ['https://novelarrow.com/novel/Unsheathed', 'novelbin:unsheathed'],
  ])('%s -> %s', (url, id) => {
    expect(normalizeNovelId(url)).toBe(id);
  });

  it('returns null for unrelated URLs', () => {
    expect(normalizeNovelId('https://novelarrow.com/')).toBeNull();
  });
});

describe('extractNovelTitle — works on both grammars', () => {
  it.each([
    ['https://novelbin.com/b/shadow-slave/chapter-1', 'Shadow Slave'],
    ['https://novelarrow.com/novel/shadow-slave', 'Shadow Slave'],
    ['https://novelarrow.com/chapter/nine-star-hegemon-body-arts/chapter-2-x', 'Nine Star Hegemon Body Arts'],
  ])('%s -> %s', (url, title) => {
    expect(extractNovelTitle(url)).toBe(title);
  });
});

describe('parseChapterFromUrl — chapter number from both grammars', () => {
  it.each([
    ['https://novelbin.com/b/some-novel/chapter-821', 821],
    ['https://novelbin.com/b/some-novel/cchapter-31', 31],
    ['https://novelarrow.com/chapter/shadow-slave/chapter-10-first-man-down', 10],
    ['https://novelarrow.com/chapter/shadow-slave/chapter-3118-dying-city', 3118],
  ])('%s -> chapter %i', (url, num) => {
    expect(parseChapterFromUrl(url)?.num).toBe(num);
  });
});

describe('healDeadSiteUrl — dead novelbin URLs fall back to the novelarrow novel page', () => {
  it.each([
    ['https://novelbin.com/b/shadow-slave/chapter-100', 'https://novelarrow.com/novel/shadow-slave'],
    ['https://www.novelbin.me/b/shadow-slave/chapter-5', 'https://novelarrow.com/novel/shadow-slave'],
    ['https://novelbin.net/b/shadow-slave', 'https://novelarrow.com/novel/shadow-slave'],
  ])('%s -> %s', (url, expected) => {
    expect(healDeadSiteUrl(url, 'novelbin:shadow-slave')).toBe(expected);
  });

  it('leaves novelarrow URLs untouched (deep links preserved)', () => {
    const url = 'https://novelarrow.com/chapter/shadow-slave/chapter-10-first-man-down';
    expect(healDeadSiteUrl(url, 'novelbin:shadow-slave')).toBe(url);
  });

  it('passes through null/undefined as null', () => {
    expect(healDeadSiteUrl(null, 'novelbin:x')).toBeNull();
    expect(healDeadSiteUrl(undefined, 'novelbin:x')).toBeNull();
  });
});

describe('deriveNovelMainUrl — novel main page from any novel/chapter URL', () => {
  it.each([
    // NovelArrow chapter URL -> /novel/<slug>
    ['https://novelarrow.com/chapter/shadow-slave/chapter-10-first-man-down', 'https://novelarrow.com/novel/shadow-slave'],
    // NovelArrow novel URL passes through unchanged
    ['https://novelarrow.com/novel/shadow-slave', 'https://novelarrow.com/novel/shadow-slave'],
    // NovelBin chapter URL -> chapter suffix stripped
    ['https://novelbin.com/b/some-novel/chapter-821', 'https://novelbin.com/b/some-novel'],
    ['https://novelbin.com/b/some-novel/cchapter31', 'https://novelbin.com/b/some-novel'],
    // NovelBin novel URL passes through unchanged
    ['https://novelbin.com/b/some-novel', 'https://novelbin.com/b/some-novel'],
  ])('%s -> %s', (url, expected) => {
    expect(deriveNovelMainUrl(url)).toBe(expected);
  });
});
