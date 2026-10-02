import { describe, expect, it } from 'vitest';
import { siteLabel, toNovelPingUrl } from './siteLabel';

describe('toNovelPingUrl', () => {
  it.each([
    ['https://novelarrow.com/novel/shadow-slave', 'https://novelping.com/novel/shadow-slave'],
    ['https://www.novelarrow.com/novel/shadow-slave', 'https://novelping.com/novel/shadow-slave'],
    [
      'https://novelarrow.com/chapter/shadow-slave/chapter-10-first-man-down?a=1#nbp=42.5',
      'https://novelping.com/novel/shadow-slave/chapter-10-first-man-down?a=1#nbp=42.5',
    ],
  ])('maps NovelArrow %s -> %s', (url, expected) => {
    expect(toNovelPingUrl(url)).toBe(expected);
  });

  it('leaves NovelPing, other hosts and look-alikes untouched, and passes null through', () => {
    expect(toNovelPingUrl('https://novelping.com/book/x')).toBe('https://novelping.com/book/x');
    expect(toNovelPingUrl('https://novelbin.com/b/x')).toBe('https://novelbin.com/b/x');
    expect(toNovelPingUrl('https://novelarrow.com.evil.com/novel/x')).toBe('https://novelarrow.com.evil.com/novel/x');
    expect(toNovelPingUrl(null)).toBeNull();
    expect(toNovelPingUrl(undefined)).toBeNull();
  });
});

describe('siteLabel', () => {
  it('names the site a stored novel URL points at', () => {
    expect(siteLabel('https://novelping.com/novel/x')).toBe('NovelPing');
    expect(siteLabel('https://www.novelping.com/book/x')).toBe('NovelPing');
    expect(siteLabel('https://novelarrow.com/novel/x')).toBe('NovelArrow');
    expect(siteLabel('https://www.novelarrow.com/chapter/x/chapter-1')).toBe('NovelArrow');
  });

  it('falls back to a neutral label for dead, unknown or missing URLs', () => {
    expect(siteLabel('https://novelbin.com/b/x')).toBe('source site');
    expect(siteLabel('not a url')).toBe('source site');
    expect(siteLabel(null)).toBe('source site');
    expect(siteLabel(undefined)).toBe('source site');
  });
});
