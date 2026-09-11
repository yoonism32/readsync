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
