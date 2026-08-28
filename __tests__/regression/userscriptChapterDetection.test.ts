/**
 * Regression tests for userscript current-chapter detection.
 *
 * Bug: on NovelArrow the reader is a Next.js SPA whose DOM (sidebar widgets,
 * stale React nodes, document.title lagging behind client-side navigation)
 * can contain a *different* chapter number than the one being read. The old
 * content-first strategy returned that number, so the backend recorded e.g.
 * 213 while the user was on chapter 215. On NovelArrow chapter routes the
 * URL is ground truth and must win over content scanning.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { parseChapterEnhanced, normalizePath, isChapterPath } from '../../userscript/src/services/ChapterDetector.js';

type DocumentStub = { title: string; querySelectorAll: () => Element[] };

const globalRef = globalThis as unknown as { document?: DocumentStub };
const originalDocument = globalRef.document;

function stubDocument(title: string): void {
  globalRef.document = {
    title,
    querySelectorAll: () => [],
  };
}

afterEach(() => {
  globalRef.document = originalDocument;
});

describe('parseChapterEnhanced — NovelArrow routes are URL-first', () => {
  beforeEach(() => {
    // Misleading content: title still shows a stale chapter number
    stubDocument('Chapter 213 – Dying City | NovelArrow');
  });

  it('uses the URL chapter number even when document.title disagrees', () => {
    const info = parseChapterEnhanced('/chapter/shadow-slave/chapter-215-the-end');
    expect(info).not.toBeNull();
    expect(info?.num).toBe(215);
    expect(info?.source).toBe('url-novelarrow');
  });

  it('handles trailing slash', () => {
    const info = parseChapterEnhanced('/chapter/shadow-slave/chapter-215/');
    expect(info?.num).toBe(215);
    expect(info?.source).toBe('url-novelarrow');
  });

  it('handles no hyphen between "chapter" and the number', () => {
    const info = parseChapterEnhanced('/chapter/shadow-slave/chapter215');
    expect(info?.num).toBe(215);
    expect(info?.source).toBe('url-novelarrow');
  });

  it('handles no title slug', () => {
    const info = parseChapterEnhanced('/chapter/shadow-slave/chapter-215');
    expect(info?.num).toBe(215);
    expect(info?.source).toBe('url-novelarrow');
  });

  /**
   * Bug: some NovelArrow slugs tag the real chapter number as "auto-<N>",
   * occasionally doubled — e.g.
   * "chapter-auto-282-auto-282-145-soaring-to-the-skies-epilepsy-case-consultation2"
   * for "my-medical-skills-give-me-experience-points". "auto-282" IS the
   * real chapter number (confirmed against the page's own
   * og:description: "Chapter 282: Chapter 145: Soaring..."); the trailing
   * "145" is just digits from the original source title. The old regex
   * required digits immediately after "chapter-", so it never matched at
   * all and fell through to the "any number in the last segment" fallback,
   * which grabbed the title-embedded 145 instead of the real chapter (282).
   */
  it('finds the real chapter number tagged "auto-<N>", not a trailing title number', () => {
    const info = parseChapterEnhanced(
      '/chapter/my-medical-skills-give-me-experience-points/chapter-auto-282-auto-282-145-soaring-to-the-skies-epilepsy-case-consultation2',
    );
    expect(info?.num).toBe(282);
    expect(info?.source).toBe('url-novelarrow');
  });
});

describe('parseChapterEnhanced — non-NovelArrow fallbacks preserved', () => {
  it('NovelBin routes stay content-first', () => {
    stubDocument('Chapter 31 – Something | NovelBin');
    const info = parseChapterEnhanced('/b/shadow-slave/chapter-31');
    expect(info?.num).toBe(31);
    expect(info?.source).toBe('title');
  });

  it('NovelBin URL fallback still works when content has no chapter number', () => {
    stubDocument('NovelBin');
    const info = parseChapterEnhanced('/b/shadow-slave/chapter-31');
    expect(info?.num).toBe(31);
    expect(info?.source).toBe('url-standard');
  });

  it('number-prefix URL fallback still works', () => {
    stubDocument('Some Site');
    const info = parseChapterEnhanced('/b/shadow-slave/31-the-beginning');
    expect(info?.num).toBe(31);
    expect(info?.source).toBe('url-number-prefix');
  });

  it('returns null when nothing matches', () => {
    stubDocument('Some Site');
    expect(parseChapterEnhanced('/novel/shadow-slave')).toBeNull();
  });
});

/**
 * Bug: the numeric-prefix heuristic (`/^\d+/` on the last path segment) exists
 * to catch NovelBin chapter URLs like /b/slug/31-the-beginning. It was applied
 * to the whole path, so a novel whose *slug* starts with digits —
 * "100x-rebate-sharing-system-retired-incubus-wants-to-marry-have-kids" — was
 * classified as a chapter page. Two consequences on its novel page: auto-update
 * bailed at the chapter guard (no refresh, ever), and progress sync ran and
 * recorded scroll position as reading progress.
 */
describe('isChapterPath — a chapter lives below the slug', () => {
  it('does not treat a digit-leading novel slug as a chapter', () => {
    expect(
      isChapterPath('/novel/100x-rebate-sharing-system-retired-incubus-wants-to-marry-have-kids'),
    ).toBe(false);
  });

  it('handles a trailing slash on such a slug', () => {
    expect(isChapterPath('/novel/100x-rebate-sharing-system/')).toBe(false);
  });

  it('treats an ordinary novel page as a novel page', () => {
    expect(isChapterPath('/novel/immortality-through-array-formations')).toBe(false);
    expect(isChapterPath('/b/shadow-slave')).toBe(false);
  });

  it('still recognises NovelArrow chapter routes', () => {
    expect(isChapterPath('/chapter/shadow-slave/chapter-215-the-end')).toBe(true);
    expect(isChapterPath('/chapter/100x-rebate-sharing-system/chapter-5')).toBe(true);
  });

  it('recognises NovelArrow routes with an "auto-<id>-" prefixed chapter number', () => {
    expect(
      isChapterPath(
        '/chapter/my-medical-skills-give-me-experience-points/chapter-auto-282-auto-282-145-soaring-to-the-skies-epilepsy-case-consultation2',
      ),
    ).toBe(true);
  });

  it('still recognises NovelBin chapter routes', () => {
    expect(isChapterPath('/b/shadow-slave/chapter-31')).toBe(true);
    expect(isChapterPath('/b/shadow-slave/31-the-beginning')).toBe(true);
    expect(isChapterPath('/b/shadow-slave/cchapter31')).toBe(true);
  });
});

describe('normalizePath — storeKey derivation', () => {
  it('normalizes cchapter variants to chapter-', () => {
    expect(normalizePath('/b/slug/cchapter31')).toBe('/b/slug/chapter-31');
    expect(normalizePath('/b/slug/chapter-31')).toBe('/b/slug/chapter-31');
  });

  it('leaves NovelArrow paths untouched', () => {
    expect(normalizePath('/chapter/slug/chapter-215-the-end')).toBe('/chapter/slug/chapter-215-the-end');
  });
});
