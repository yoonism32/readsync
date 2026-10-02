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
