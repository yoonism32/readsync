-- NovelBin moved to novelarrow.com with a new URL grammar:
--   novel page:   /b/<slug>          -> /novel/<slug>
--   chapter page: /b/<slug>/chapter-N -> /chapter/<slug>/chapter-N-<title>
-- Slugs are unchanged. Novel IDs keep the legacy "novelbin:" prefix.

-- Rewrite stored novel main-page URLs from any novelbin mirror to novelarrow.
UPDATE novels
SET primary_url = 'https://novelarrow.com/novel/' ||
      substring(primary_url from '/b/([^/?#]+)')
WHERE primary_url ~ 'novelbin\.(com|me|net|org)/b/'
  AND substring(primary_url from '/b/([^/?#]+)') IS NOT NULL;

-- Normalize any rows saved in the wrong /chapter/<slug>... shape (chapter URL
-- persisted as primary_url before the derivation fix).
UPDATE novels
SET primary_url = 'https://novelarrow.com/novel/' ||
      substring(primary_url from '/chapter/([^/?#]+)')
WHERE primary_url ~ 'novelarrow\.com/chapter/'
  AND substring(primary_url from '/chapter/([^/?#]+)') IS NOT NULL;
