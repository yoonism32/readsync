/**
 * Characterizes ChapterDetector.ts's page-metadata extractors (genres,
 * author, cover URL, update time) before splitting them into their own
 * module — they're a self-contained, DOM-only slice with a single importer
 * (userscript/src/main.ts) and no shared state with the rest of the file.
 */
import { describe, it, expect, afterEach } from 'vitest';
import {
  extractGenres,
  extractAuthor,
  extractCoverUrl,
  extractUpdateTime,
} from '../../userscript/src/services/PageMetadata.js';

interface ElementStub {
  textContent: string | null;
  getAttribute?: (name: string) => string | null;
}

const globalRef = globalThis as unknown as { document?: unknown };
const originalDocument = globalRef.document;

function stubDocument(opts: {
  querySelector?: Record<string, ElementStub | null>;
  querySelectorAll?: Record<string, ElementStub[]>;
}): void {
  const single = opts.querySelector ?? {};
  const lists = opts.querySelectorAll ?? {};
  globalRef.document = {
    querySelector: (selector: string) =>
      Object.prototype.hasOwnProperty.call(single, selector) ? single[selector] : null,
    querySelectorAll: (selector: string) => lists[selector] ?? [],
  };
}

function metaEl(content: string | null): ElementStub {
  return { textContent: null, getAttribute: (n) => (n === 'content' ? content : null) };
}

afterEach(() => {
  globalRef.document = originalDocument;
});

const GENRE_META = 'meta[property="og:novel:genre"], meta[name="og:novel:genre"]';
const GENRE_LIST = '[class*="genre"], [class*="tag"], .categories';
const AUTHOR_META = 'meta[property="og:novel:author"], meta[name="og:novel:author"]';
const AUTHOR_SELECTORS = ['[class*="author"]', '.by-line', '[itemprop="author"]'];
const COVER_META = 'meta[property="og:image"], meta[name="og:image"]';
const TIME_META = 'meta[name="og:novel:update_time"], meta[property="og:novel:update_time"]';
const TIME_SELECTORS = ['.item-time', '[class*="update"]', '[class*="time"]', 'time'];

describe('extractGenres', () => {
  it('reads the meta tag content verbatim', () => {
    stubDocument({ querySelector: { [GENRE_META]: metaEl('Fantasy, Action') } });
    expect(extractGenres()).toBe('Fantasy, Action');
  });

  it('falls back to joining genre/tag elements when no meta is present', () => {
    stubDocument({
      querySelector: { [GENRE_META]: null },
      querySelectorAll: {
        [GENRE_LIST]: [{ textContent: 'Fantasy' }, { textContent: 'Action' }, { textContent: '' }],
      },
    });
    expect(extractGenres()).toBe('Fantasy, Action');
  });

  it('returns null when neither source has anything', () => {
    stubDocument({ querySelector: { [GENRE_META]: null }, querySelectorAll: { [GENRE_LIST]: [] } });
    expect(extractGenres()).toBeNull();
  });
});

describe('extractAuthor', () => {
  it('reads the meta tag content verbatim', () => {
    stubDocument({ querySelector: { [AUTHOR_META]: metaEl('Jane Doe') } });
    expect(extractAuthor()).toBe('Jane Doe');
  });

  it('strips an "Author:" prefix from a DOM element', () => {
    stubDocument({
      querySelector: {
        [AUTHOR_META]: null,
        [AUTHOR_SELECTORS[0]]: { textContent: 'Author: John Smith' },
      },
    });
    expect(extractAuthor()).toBe('John Smith');
  });

  it('skips a selector whose text is too long and tries the next one', () => {
    stubDocument({
      querySelector: {
        [AUTHOR_META]: null,
        [AUTHOR_SELECTORS[0]]: { textContent: 'x'.repeat(150) },
        [AUTHOR_SELECTORS[1]]: { textContent: 'Real Author' },
      },
    });
    expect(extractAuthor()).toBe('Real Author');
  });

  it('returns null when nothing matches', () => {
    stubDocument({ querySelector: { [AUTHOR_META]: null } });
    expect(extractAuthor()).toBeNull();
  });
});

describe('extractCoverUrl', () => {
  it('accepts an https og:image URL with a path', () => {
    stubDocument({
      querySelector: { [COVER_META]: metaEl('https://cdn.example.com/covers/1.jpg') },
    });
    expect(extractCoverUrl()).toBe('https://cdn.example.com/covers/1.jpg');
  });

  it('rejects a non-https URL', () => {
    stubDocument({ querySelector: { [COVER_META]: metaEl('http://cdn.example.com/covers/1.jpg') } });
    expect(extractCoverUrl()).toBeNull();
  });

  it('returns null when the meta tag is absent', () => {
    stubDocument({ querySelector: { [COVER_META]: null } });
    expect(extractCoverUrl()).toBeNull();
  });
});

describe('extractUpdateTime', () => {
  it('reads the meta tag content verbatim', () => {
    stubDocument({ querySelector: { [TIME_META]: metaEl('2026-08-20T12:00:00Z') } });
    expect(extractUpdateTime()).toBe('2026-08-20T12:00:00Z');
  });

  it('falls back to a DOM element whose text looks like a relative/absolute time', () => {
    stubDocument({
      querySelector: {
        [TIME_META]: null,
        [TIME_SELECTORS[0]]: { textContent: '3 hours ago' },
      },
    });
    expect(extractUpdateTime()).toBe('3 hours ago');
  });

  it('skips a matched element whose text does not look like a time', () => {
    stubDocument({
      querySelector: {
        [TIME_META]: null,
        [TIME_SELECTORS[0]]: { textContent: 'not a time' },
        [TIME_SELECTORS[1]]: { textContent: '5 days ago' },
      },
    });
    expect(extractUpdateTime()).toBe('5 days ago');
  });

  it('returns null when nothing matches', () => {
    stubDocument({ querySelector: { [TIME_META]: null } });
    expect(extractUpdateTime()).toBeNull();
  });
});
