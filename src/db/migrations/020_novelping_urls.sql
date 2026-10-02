-- novelarrow.com now 302s to novelping.com. Slugs are unchanged and a novel's
-- landing page is /novel/<slug> on both, so repoint stored novel URLs directly:
-- "Open on ..." and Refresh All then skip the cross-site redirect (Refresh All
-- relies on the opened tab keeping window.opener / window.name).
--
-- Idempotent. progress_snapshots.url and bookmarks.chapter_url are deliberately
-- NOT rewritten (139k rows): they are healed at read time by
-- NovelService.healDeadSiteUrl, which keeps this change small and reversible.
UPDATE novels
SET primary_url = 'https://novelping.com/novel/' ||
      substring(primary_url from '/(?:novel|chapter)/([^/?#]+)')
WHERE primary_url ~* '^https?://(www\.)?novelarrow\.com/(novel|chapter)/'
  AND substring(primary_url from '/(?:novel|chapter)/([^/?#]+)') IS NOT NULL;
