/**
 * NovelPing support in the userscript (docs/NOVELPING_MIGRATION.md, Phase 2).
 * Findings from the 2026-10-02 audit of the live site:
 *  - routes are /novel/<slug>[/chapter-N…] and /book/<slug>[/chapter-N…]
 *  - URL chapter index != title chapter number mid-novel (URL chapter-1000 can
 *    carry title "Chapter 991"); stored history follows the URL → URL-first
 *  - latest-chapter meta key is misspelled: og:novel:lastest_chapter_name
 *  - synopsis lives in #novel-description-content
 */
import { describe, it, expect, afterEach } from 'vitest';
import {
  extractLatestChapterInfo,
  normalizeNovelId,
  parseChapterEnhanced,
} from '../../userscript/src/services/ChapterDetector.js';
import { extractSynopsis } from '../../userscript/src/services/PageMetadata.js';

interface ElementStub {
  textContent: string | null;
  href?: string;
  getAttribute?: (name: string) => string | null;
  querySelectorAll?: (selector: string) => ElementStub[];
}

const g = globalThis as unknown as { document?: unknown; location?: unknown; fetch?: unknown };
const original = { document: g.document, location: g.location, fetch: g.fetch };

afterEach(() => {
  g.document = original.document;
  g.location = original.location;
  g.fetch = original.fetch;
});

const metaEl = (content: string): ElementStub => ({
  textContent: null,
  getAttribute: (n) => (n === 'content' ? content : null),
});

describe('normalizeNovelId — NovelPing /book/ and /novel/', () => {
  it.each([
    ['https://novelping.com/book/supreme-magus-novel', 'novelbin:supreme-magus-novel'],
    ['https://novelping.com/book/supreme-magus-novel/chapter-2', 'novelbin:supreme-magus-novel'],
    ['https://novelping.com/novel/supreme-magus-novel/chapter-2', 'novelbin:supreme-magus-novel'],
  ])('%s -> %s', (url, id) => {
    expect(normalizeNovelId(url)).toBe(id);
  });

  it('does not match a slug that merely contains "book"', () => {
    expect(normalizeNovelId('https://novelping.com/handbook-of-x')).toBeNull();
  });
});

describe('parseChapterEnhanced — NovelPing routes are URL-first', () => {
  it.each([
    ['/book/supreme-magus-novel/chapter-1000', 1000],
    ['/book/nine-star-hegemon-body-arts/chapter-7268-leaving', 7268],
    ['/novel/supreme-magus-novel/chapter-2', 2],
    ['/book/i-can-devour-monsters-sss-talents/chapter-1-the-second-failure', 1],
    // auto-<N> is the real number; the trailing 145 is from the original source title
    ['/novel/my-medical-skills/chapter-auto-282-auto-282-145-soaring-to-the-skies', 282],
  ])('%s -> chapter %i even when the page title names a different chapter', (pathname, num) => {
    // supreme-magus-novel: URL chapter-1000 carries the title "Chapter 991"
    g.document = { title: 'Supreme Magus – Chapter 991 Questions and Answers | NovelPing', querySelectorAll: () => [] };
    const info = parseChapterEnhanced(pathname);
    expect(info?.num).toBe(num);
    expect(info?.source).toBe('url-novelping');
  });

  it('still refuses novel landing pages', () => {
    g.document = { title: 'Supreme Magus | NovelPing', querySelectorAll: () => [] };
    expect(parseChapterEnhanced('/book/supreme-magus-novel')).toBeNull();
    expect(parseChapterEnhanced('/novel/supreme-magus-novel')).toBeNull();
  });
});

function stubNovelpingPage(opts: {
  pathname: string;
  typoMeta?: string;
  linkSelectorNeedle?: string;
  links?: string[];
}): void {
  g.document = {
    title: '',
    querySelector: (sel: string) =>
      opts.typoMeta && sel.includes('lastest_chapter_name') ? metaEl(opts.typoMeta) : null,
    querySelectorAll: (sel: string) =>
      opts.linkSelectorNeedle && sel.includes(opts.linkSelectorNeedle)
        ? (opts.links ?? []).map((href) => ({ href, textContent: null }))
        : [],
  };
  g.location = {
    pathname: opts.pathname,
    href: `https://novelping.com${opts.pathname}`,
    origin: 'https://novelping.com',
  };
  g.fetch = () => Promise.reject(new Error('network disabled in tests'));
}

describe('extractLatestChapterInfo — NovelPing', () => {
  it('reads the misspelled og:novel:lastest_chapter_name meta', () => {
    stubNovelpingPage({ pathname: '/book/nine-star-hegemon-body-arts', typoMeta: 'Chapter 7268 Leaving' });
    const info = extractLatestChapterInfo();
    expect(info.latestChapterNum).toBe(7268);
    expect(info.latestChapterTitle).toBe('Leaving');
    expect(info.verified).toBe(true);
  });

  it('finds same-novel chapter links on a /book/ chapter page (slug recognised)', () => {
    stubNovelpingPage({
      pathname: '/book/some-novel/chapter-5-x',
      linkSelectorNeedle: '/book/some-novel/',
      links: ['https://novelping.com/book/some-novel/chapter-6-next'],
    });
    expect(extractLatestChapterInfo(5).latestChapterNum).toBe(6);
  });

  it('ignores chapter numbers that only appear in a ?next= redirect param (the logged-out "Login" link)', () => {
    // Found live 2026-10-02: <a href="/login-email?next=%2Fbook%2F…%2Fchapter-2494-…">Login</a>.
    // Matching the whole href made "Login" the latest-chapter title, and the
    // server stores that title whenever the chapter number advances.
    stubNovelpingPage({
      pathname: '/book/some-novel/chapter-5-x',
      linkSelectorNeedle: 'href*="chapter"',
      links: ['https://novelping.com/login-email?next=%2Fbook%2Fsome-novel%2Fchapter-5-x'],
    });
    expect(extractLatestChapterInfo(5).latestChapterNum).toBeNull();
  });

  it('finds same-novel chapter links on a /novel/ chapter page', () => {
    stubNovelpingPage({
      pathname: '/novel/some-novel/chapter-5',
      linkSelectorNeedle: '/novel/some-novel/',
      links: ['https://novelping.com/novel/some-novel/chapter-6'],
    });
    expect(extractLatestChapterInfo(5).latestChapterNum).toBe(6);
  });
});

describe('extractSynopsis — NovelPing #novel-description-content', () => {
  it('joins the paragraphs of the description container', async () => {
    const container: ElementStub = {
      textContent: 'ignored when paragraphs exist',
      querySelectorAll: (sel) =>
        sel === 'p' ? [{ textContent: 'Long Chen was crippled.' }, { textContent: 'Then everything changed.' }] : [],
    };
    g.document = {
      querySelector: (sel: string) => (sel === '#novel-description-content' ? container : null),
      querySelectorAll: () => [],
    };
    await expect(extractSynopsis()).resolves.toBe('Long Chen was crippled.\n\nThen everything changed.');
  });
});
