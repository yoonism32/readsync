export const READER_HOSTS = [
  'novelarrow.com',
  'novelbin.com',
  'novelbin.me',
  'novelbin.net',
  'novelbin.org',
];

export function isReaderUrl(value: unknown): boolean {
  if (typeof value !== 'string' || value.length > 4096) return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      !url.port &&
      READER_HOSTS.includes(url.hostname.replace(/^www\./, ''))
    );
  } catch {
    return false;
  }
}

/**
 * A URL that is safe to accept as reading progress. `isReaderUrl` deliberately
 * accepts both novel landing pages and reader pages for metadata/bookmark
 * features; progress snapshots must be narrower because they carry a chapter
 * number. Requiring a real chapter segment prevents a title such as
 * `...-10000x-bonus-reward` from being recorded as chapter 10000.
 */
export function isReaderChapterUrl(value: unknown): boolean {
  if (!isReaderUrl(value) || typeof value !== 'string') return false;

  const url = new URL(value);
  const host = url.hostname.replace(/^www\./, '');
  const path = url.pathname;

  if (host === 'novelarrow.com') {
    return /^\/chapter\/[^/]+\/chapter-?(?:auto-\d+|\d+)(?:[-/]|$)/i.test(path);
  }

  return /^\/b\/[^/]+\/(?:c*chapter-?\d+|\d+)(?:[-/]|$)/i.test(path);
}

export function isReaderCoverUrl(value: unknown): boolean {
  if (typeof value !== 'string' || value.length > 4096) return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      !url.port &&
      READER_HOSTS.some((host) => url.hostname === `images.${host}`)
    );
  } catch {
    return false;
  }
}
