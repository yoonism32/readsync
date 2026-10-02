import { describe, expect, it } from 'vitest';
import { siteLabel } from './siteLabel';

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
