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
  healDeadSiteUrl,
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

  it('extracts every synopsis paragraph from the current Next.js page payload', () => {
    expect(info.synopsis).toBe(
      'Growing up in poverty, Sunny never expected anything good from life.\n\n' +
      'He didn\'t know "fear" until the Nightmare Spell chose him & everything changed.\n\n' +
      'Now he must survive.',
    );
  });
});

describe('parseNovelInfoFromHTML — synopsis edge cases', () => {
  it('returns null synopsis when no Synopsis section is present', () => {
    // novelbin-novel-page.html has no <dt>Synopsis:</dt> or .synopsis div
    const info = parseNovelInfoFromHTML(
      fixture('novelbin-novel-page.html'),
      'https://novelbin.com/b/some-novel',
    );
    expect(info.synopsis).toBeNull();
  });

  it('returns null synopsis when the parsed content exceeds the max length (never truncates)', () => {
    const oversized = 'x'.repeat(20_001);
    const html = `<html><body><dt>Synopsis:</dt><dd>${oversized}</dd></body></html>`;
    const info = parseNovelInfoFromHTML(html, 'https://novelarrow.com/novel/x');
    expect(info.synopsis).toBeNull();
  });

  it('preserves paragraphs from the modern visible synopsis when no page payload is present', () => {
    const html = '<div class="site-reading-copy site-reading-prose"><p>First paragraph.</p><p>Second paragraph.</p></div>';
    const info = parseNovelInfoFromHTML(html, 'https://novelarrow.com/novel/x');
    expect(info.synopsis).toBe('First paragraph.\n\nSecond paragraph.');
  });

  it('returns null synopsis when the section is present but empty after cleanup', () => {
    const html = '<html><body><dt>Synopsis:</dt><dd>   <p></p>   </dd></body></html>';
    const info = parseNovelInfoFromHTML(html, 'https://novelarrow.com/novel/x');
    expect(info.synopsis).toBeNull();
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
