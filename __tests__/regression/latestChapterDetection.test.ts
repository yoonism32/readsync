/**
 * Regression tests for userscript latest-chapter detection on NovelArrow.
 *
 * Three production failures:
 *
 *  1. forced-to-be-my-sisters-lover-in-a-reverse-world — the meta reads
 *     "Epilogue" and contains no digits at all, so detection fell through to the
 *     DOM. But NovelArrow only server-renders `initialChapterList`, which is
 *     chapters 1–30 *ascending* — so it reported exactly 30 against a stored 92,
 *     and would have done so on every refresh forever. Fix: fall back to the
 *     header's "<N> Chapters" figure when nothing else names a chapter.
 *
 *  2. (2026-08-06) That header-count fallback was then trusted too broadly — it
 *     originally won over *any* smaller candidate, including a meta that named a
 *     real, titled chapter. "<N> Chapters" is a document COUNT, not a chapter
 *     NUMBER, and NovelArrow's numbering isn't 1:1 with it (bonus/side entries
 *     like "897_2" inflate the count past the true latest). Three novels hit
 *     this: immortality-through-array-formations (header 1 over the real
 *     latest), i-can-see-through-all-things-information (2 over), and
 *     longevity-by-picking-up-attributes-in-the-battlefield (14 over). All three
 *     ended up with novels.latest_chapter_num paired with a title that named a
 *     *different*, lower chapter — proof the header figure was never a real
 *     chapter. The damage was permanent: admin.ts's update guard never lets
 *     latest_chapter_num decrease, so "next chapter" navigation dead-ended at
 *     "No further chapters available" forever. Fix: a titled meta chapter now
 *     always outranks the bare header count; the count only fills gaps when
 *     nothing names a chapter at all (failure #1 above).
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
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
  DOMParser?: unknown;
};
const original = {
  document: globalRef.document,
  location: globalRef.location,
  fetch: globalRef.fetch,
  DOMParser: globalRef.DOMParser,
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
  globalRef.DOMParser = original.DOMParser;
});

/** Minimal DOMParser stub — just enough for the main-page fallback's
 *  meta-tag lookup on a plain HTML string with no real DOM available. */
function stubDOMParser(): void {
  globalRef.DOMParser = class {
    parseFromString(html: string) {
      const metaMatch = html.match(
        /<meta[^>]*(?:name|property)="og:novel:latest_chapter_name"[^>]*content="([^"]*)"/,
      );
      const metaEl: ElementStub | null = metaMatch
        ? { textContent: null, getAttribute: (n) => (n === 'content' ? metaMatch[1] : null) }
        : null;
      return {
        querySelector: (selector: string) =>
          selector.includes('og:novel:latest_chapter_name') ? metaEl : null,
        querySelectorAll: () => [],
      };
    }
  };
}

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

describe('extractLatestChapterInfo — a titled meta chapter beats the bare header count', () => {
  it('reports 2627 from the meta, not 2640 from the header (immortality, corrected)', () => {
    // Originally asserted 2640 on the theory that premium chapters ran ahead
    // of a free-chapter-only meta. Production evidence on 2026-08-06 disproved
    // that: novels.latest_chapter_num was 2645 with title "Chapter 68: Heart
    // Skill of Causality" — which the site itself names as chapter 2644, not
    // 2645. There was never a real chapter 2645; "2645 Chapters" just counts
    // more documents than the numbering goes up to.
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
    expect(info.latestChapterNum).toBe(2627);
    expect(info.latestChapterTitle).toBe('62: Great Witch (2)');
  });

  it('reports 1527 from the meta, not 1529 from the header (i-can-see-through-all-things-information, 2026-08-06)', () => {
    stubPage({
      meta: 'Chapter 1527 900: Breaking Through the Heavenly Demon Origin Space by Force',
      spans: ['1529 Chapters'],
      pathname: '/novel/i-can-see-through-all-things-information',
    });

    const info = extractLatestChapterInfo();
    expect(info.latestChapterNum).toBe(1527);
    expect(info.latestChapterTitle).toBe(
      '900: Breaking Through the Heavenly Demon Origin Space by Force',
    );
  });

  it('reports 1086 from the meta, not 1100 from the header (longevity-by-picking-up-attributes-in-the-battlefield, 2026-08-06)', () => {
    stubPage({
      meta: 'Chapter 1086 - 460: Uniting Against Qin Court? (2)',
      spans: ['1100 Chapters'],
      pathname: '/novel/longevity-by-picking-up-attributes-in-the-battlefield',
    });

    const info = extractLatestChapterInfo();
    expect(info.latestChapterNum).toBe(1086);
    expect(info.latestChapterTitle).toBe('460: Uniting Against Qin Court? (2)');
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

describe('extractLatestChapterInfo — a chapter page\'s nav links must not mask a higher true latest', () => {
  it('does not let a "Next Chapter" link (656) permanently mask the true latest (669) while reading chapter 655 of a 669-chapter novel', async () => {
    // Production incident 2026-08-12 (eternal-life-by-daily-divination):
    // a chapter-reading page has no og:novel meta and no "<N> Chapters"
    // header (those only render on the novel's main page) — the only local
    // signal is nav links, and "Next Chapter" points to 656. The old flat
    // `maxChapter < 500` gate treated 656 as "good enough" and skipped the
    // main-page fallback fetch that would find the true latest (669). The
    // same wrong 656 then repeated on every scroll-triggered sync, and the
    // server's "same wrong number twice in a row" self-healing correction
    // (ChapterCorrection.ts) trusted it and overwrote the correct stored
    // 669 with 656.
    vi.resetModules();
    const fresh = await import('../../userscript/src/services/ChapterDetector.js');

    let fetchCalled = false;
    const mainPageHtml = `<html><head>
      <meta name="og:novel:latest_chapter_name" content="Chapter 669 - 323: Astounding Array Dao">
    </head></html>`;
    stubPage({
      links: [
        { href: 'https://novelarrow.com/chapter/eternal-life-by-daily-divination/chapter-654-prev' },
        { href: 'https://novelarrow.com/chapter/eternal-life-by-daily-divination/chapter-656-next' },
      ],
      pathname: '/chapter/eternal-life-by-daily-divination/chapter-655-current',
    });
    globalRef.fetch = () => {
      fetchCalled = true;
      return Promise.resolve({ text: () => Promise.resolve(mainPageHtml) });
    };
    stubDOMParser();

    // The very first sync on the page can't know 656 is wrong yet (the
    // fallback fetch is fire-and-forget, so this call returns before it
    // resolves) — but passing the reader's current chapter must be enough
    // to trigger the fallback at all, which the flat 500 threshold didn't.
    fresh.extractLatestChapterInfo(655);
    expect(fetchCalled).toBe(true);

    // Let the fire-and-forget main-page fetch resolve, then sync again —
    // as every real reading session does within the next scroll-debounce
    // tick. From here on the true latest must win, so 656 never repeats
    // twice in a row and never gets "confirmed" server-side.
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    expect(fresh.extractLatestChapterInfo(655).latestChapterNum).toBe(669);
  });
});
