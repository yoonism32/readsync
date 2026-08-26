-- NovelArrow synopsis is one-time-imported metadata (docs/ROADMAP.md
-- "Novel metadata"): fetched once when missing, never overwritten by
-- Refresh All / Update All or a future recurring scan. Separate column
-- from `description` (user import/export field, src/routes/novels.ts)
-- so scraped synopsis text can't collide with that feature's meaning.

ALTER TABLE novels ADD COLUMN IF NOT EXISTS synopsis TEXT;
ALTER TABLE novels ADD COLUMN IF NOT EXISTS synopsis_imported_at TIMESTAMPTZ;
