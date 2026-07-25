/**
 * Regression tests for the novelbin.com -> novelarrow.com migration.
 *
 * NovelArrow changed the URL grammar (/b/<slug> -> /novel/<slug>,
 * /b/<slug>/chapter-N -> /chapter/<slug>/chapter-N-<title>) and serves
 * og:novel:* metas with name= instead of property=. The fixture
 * novelarrow-novel-page.html is trimmed from the real page (2026-07-25).
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { parseNovelInfoFromHTML } from '../../bot/src/parseNovelInfo.js';
import {
  deriveNovelMainUrl,
  extractNovelTitle,
  normalizeNovelId,
  parseChapterFromUrl,
} from '../../src/services/NovelService.js';

const fixture = (name: string): string =>
  fs.readFileSync(path.join(__dirname, '../fixtures', name), 'utf8');

describe('parseNovelInfoFromHTML — NovelArrow page (name= metas, no .l-chapter)', () => {
  const info = parseNovelInfoFromHTML(
    fixture('novelarrow-novel-page.html'),
    'https://novelarrow.com/novel/shadow-slave',
  );

  it('extracts latest chapter number and title from og:novel:latest_chapter_name', () => {
    expect(info.chapter).toEqual({ num: 3118, title: 'Dying City' });
  });

  it('extracts genres from og:novel:genre', () => {
    expect(info.genres).toEqual(['ACTION', 'ADVENTURE', 'FANTASY', 'ROMANCE', 'SUPERNATURAL']);
  });

  it('extracts author from og:novel:author', () => {
    expect(info.author).toBe('Guiltythree');
  });

  it('parses ISO og:novel:update_time', () => {
    expect(info.site_latest_chapter_time_raw).toBe('2026-07-24T18:15:04.030Z');
    expect(info.site_latest_chapter_time).toBe('2026-07-24T18:15:04.030Z');
  });
});

describe('parseNovelInfoFromHTML — NovelBin page (property= metas, .l-chapter)', () => {
  const info = parseNovelInfoFromHTML(
    fixture('novelbin-novel-page.html'),
    'https://novelbin.com/b/some-novel',
  );

  it('extracts latest chapter from the meta (title after colon)', () => {
    expect(info.chapter).toEqual({ num: 821, title: 'The Final Stand' });
  });

  it('extracts genres and author via property= metas', () => {
    expect(info.genres).toEqual(['Action', 'Fantasy']);
    expect(info.author).toBe('Some Author');
  });

  it('prefers relative .item-time over the update_time meta', () => {
    expect(info.site_latest_chapter_time_raw).toBe('2 hours ago');
    expect(info.site_latest_chapter_time).not.toBeNull();
  });
});

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
