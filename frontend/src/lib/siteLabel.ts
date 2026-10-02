// novelarrow.com 302s to novelping.com with this exact mapping (title slug, query and
// #fragment preserved); mirrors NovelService.healDeadSiteUrl on the server.
const NOVELARROW_URL = /^https?:\/\/(?:www\.)?novelarrow\.com\/(?:chapter|novel)\/([^/?#]+)(.*)$/i;

/**
 * The NovelPing equivalent of a stored NovelArrow URL, so links skip the redirect and
 * name the right site. Other URLs pass through. Becomes a no-op once the stored
 * URLs themselves are migrated; then it can be deleted.
 */
export function toNovelPingUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(NOVELARROW_URL);
  return m ? `https://novelping.com/novel/${m[1]}${m[2]}` : url;
}

/** Human name of the site a stored novel URL points at, for "Open on …" links. */
export function siteLabel(url: string | null | undefined): string {
  if (url) {
    try {
      const host = new URL(url).hostname.replace(/^www\./, '');
      if (host === 'novelping.com') return 'NovelPing';
      if (host === 'novelarrow.com') return 'NovelArrow';
    } catch {
      /* unparsable URL: fall through to the neutral label */
    }
  }
  return 'source site';
}
