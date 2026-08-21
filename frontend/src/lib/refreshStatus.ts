export function lastRefreshLabel(iso: string | null): string {
  if (!iso) return 'never';
  const ms = Date.now() - new Date(iso).getTime();
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return h > 0 ? `${h}h ${m}m ago` : `${m}m ago`;
}

const FAILURE_LABELS: Record<string, string> = {
  no_url: 'no site URL on record',
  popup_blocked: 'popup blocked — allow popups for this site',
  timeout: 'timed out after 30s',
  no_chapter_info: 'no chapter number found on page',
  chapter_page: 'link opened a chapter, not the novel page',
  no_novel_id: 'could not read a novel ID from the URL',
  api_error: 'server rejected the update',
  exception: 'userscript error',
  unknown: 'refresh did not report a reason',
};

/** `api_error:404` → "server rejected the update (HTTP 404)". */
export function describeFailure(reason: string): string {
  const [kind, status] = reason.split(':');
  const label = FAILURE_LABELS[kind] ?? kind;
  return status ? `${label} (HTTP ${status})` : label;
}
