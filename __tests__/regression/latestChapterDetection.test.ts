/**
 * Regression tests for userscript latest-chapter detection on NovelArrow.
 *
 * Two production failures, both traced to `extractLatestChapterInfo` returning
 * at the first strategy that produced a number instead of taking the best one:
 *
 *  1. immortality-through-array-formations — the og:novel meta names the latest
 *     *free* chapter ("Chapter 2627 …", isFree:true) while premium chapters run
 *     ahead of it. The meta short-circuited the scan, so 2627 was reported for a
 *     novel the server had at 2635 and the monotonic guard rejected the update.
 *
 *  2. forced-to-be-my-sisters-lover-in-a-reverse-world — the meta reads
 *     "Epilogue" and contains no digits at all, so detection fell through to the
 *     DOM. But NovelArrow only server-renders `initialChapterList`, which is
 *     chapters 1–30 *ascending* — so it reported exactly 30 against a stored 92,
 *     and would have done so on every refresh forever.
 *
 * Both pages render the true size in the header as "<N> Chapters", which is what
 * detection now prefers.
 */
import { describe, it, expect, afterEach } from 'vitest';
import {
  extractHeaderChapterCount,
  extractLatestChapterInfo,
} from '../../userscript/src/services/ChapterDetector.js';

interface ElementStub {
  textContent: string | null;
  href?: string;
  getAttribute?: (name: string) => string | null;
}

interface PageStub {
  /** content of the og:novel:latest_chapter_name meta, or null for absent */
  meta?: string | null;
  /** textContent of every <span> on the page */
  spans?: string[];
  /** chapter anchors: absolute hrefs */
  links?: { href: string; text?: string }[];
  pathname?: string;
}

const globalRef = globalThis as unknown as {
  document?: unknown;
  location?: unknown;
  fetch?: unknown;
};
const original = {
  document: globalRef.document,
  location: globalRef.location,
  fetch: globalRef.fetch,
};

function stubPage({
  meta = null,
  spans = [],
  links = [],
  pathname = '/novel/some-novel',
}: PageStub): void {
  const metaEl: ElementStub | null =
    meta === null
      ? null
      : { textContent: null, getAttribute: (n) => (n === 'content' ? meta : null) };

  const spanEls: ElementStub[] = spans.map((textContent) => ({ textContent }));
  const linkEls: ElementStub[] = links.map((l) => ({
    href: l.href,
    textContent: l.text ?? null,
  }));

  globalRef.document = {
    title: '',
    querySelector: (selector: string) =>
      selector.includes('og:novel:latest_chapter_name') ? metaEl : null,
    querySelectorAll: (selector: string) =>
      selector === 'span' ? spanEls : selector.includes('chapter') ? linkEls : [],
  };
  globalRef.location = { pathname, href: `https://novelarrow.com${pathname}`, origin: 'https://novelarrow.com' };
  // Detection may kick off a novel-page fetch; keep it off the network.
  globalRef.fetch = () => Promise.reject(new Error('network disabled in tests'));
}

afterEach(() => {
  globalRef.document = original.document;
  globalRef.location = original.location;
  globalRef.fetch = original.fetch;
});

describe('extractHeaderChapterCount', () => {
  it('reads the "<N> Chapters" header span', () => {
    stubPage({ spans: ['Ranking', '2640 Chapters', 'ACTION'] });
    expect(extractHeaderChapterCount()).toBe(2640);
  });

  it('handles a thousands separator', () => {
    stubPage({ spans: ['1,204 Chapters'] });
    expect(extractHeaderChapterCount()).toBe(1204);
  });

  it('accepts the singular form', () => {
    stubPage({ spans: ['1 Chapter'] });
    expect(extractHeaderChapterCount()).toBe(1);
  });

  it('ignores spans that merely mention chapters', () => {
    stubPage({ spans: ['Chapters', 'Read 12 Chapters today', 'Latest chapter'] });
    expect(extractHeaderChapterCount()).toBeNull();
  });

  it('returns null when no header count is present', () => {
    stubPage({ spans: [] });
    expect(extractHeaderChapterCount()).toBeNull();
  });
});

describe('extractLatestChapterInfo — header count beats a free-chapter meta', () => {
  it('reports 2640, not the 2627 free-chapter meta (immortality regression)', () => {
    stubPage({
      meta: 'Chapter 2627 - 62: Great Witch (2)',
      spans: ['2640 Chapters'],
      links: [
        { href: 'https://novelarrow.com/chapter/immortality/chapter-2626-great-witch' },
        { href: 'https://novelarrow.com/chapter/immortality/chapter-2627-62-great-witch-2' },
      ],
      pathname: '/novel/immortality',
    });

    const info = extractLatestChapterInfo();
    expect(info.latestChapterNum).toBe(2640);
    // The meta still names a real chapter — keep it rather than nulling the title.
    expect(info.latestChapterTitle).toBe('62: Great Witch (2)');
  });
});

describe('extractLatestChapterInfo — numberless meta must not fall into the first-30 trap', () => {
  it('reports 92 from the header, not 30 from initialChapterList (sisters-lover regression)', () => {
    stubPage({
      meta: 'Epilogue',
      spans: ['92 Chapters'],
      // NovelArrow server-renders only chapters 1..30, ascending.
      links: Array.from({ length: 30 }, (_, i) => ({
        href: `https://novelarrow.com/chapter/sisters-lover/chapter-${i + 1}`,
      })),
      pathname: '/novel/sisters-lover',
    });

    expect(extractLatestChapterInfo().latestChapterNum).toBe(92);
  });
});

describe('extractLatestChapterInfo — fallbacks preserved', () => {
  it('falls back to the meta number when no header count exists', () => {
    stubPage({
      meta: 'Chapter 3118 Dying City',
      spans: [],
      links: [],
      pathname: '/novel/shadow-slave',
    });

    const info = extractLatestChapterInfo();
    expect(info.latestChapterNum).toBe(3118);
    expect(info.latestChapterTitle).toBe('Dying City');
  });

  it('falls back to the highest chapter link when meta and header are both absent', () => {
    stubPage({
      spans: [],
      links: [
        { href: 'https://novelarrow.com/chapter/slug/chapter-7' },
        { href: 'https://novelarrow.com/chapter/slug/chapter-41' },
        { href: 'https://novelarrow.com/chapter/slug/chapter-12' },
      ],
      pathname: '/novel/slug',
    });

    expect(extractLatestChapterInfo().latestChapterNum).toBe(41);
  });

  it('returns null when the page carries no chapter signal at all', () => {
    stubPage({ spans: ['Ranking'], links: [], pathname: '/novel/slug' });
    expect(extractLatestChapterInfo().latestChapterNum).toBeNull();
  });
});
