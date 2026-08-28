-- "Added" (frontend MyList column + sort) previously read user_novel_meta.started_at,
-- which every reread (manual or auto-detected) unconditionally overwrites with
-- CURRENT_TIMESTAMP. That conflated "date added to ReadSync" with "current
-- read-through's start date" and let a reread silently corrupt "Added" for any
-- novel. This adds a real created_at, set once and never touched by a reread.

ALTER TABLE user_novel_meta ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;

-- Backfill: earliest known read_history start (true first-ever start across all
-- read-throughs) if any exist, else the current started_at (safe when the novel
-- has never been reread, since started_at was never overwritten for that row).
UPDATE user_novel_meta SET created_at =
  COALESCE(
    (SELECT MIN((e->>'started_at')::timestamptz)
     FROM jsonb_array_elements(read_history) e),
    started_at
  )
WHERE created_at IS NULL;

ALTER TABLE user_novel_meta ALTER COLUMN created_at SET DEFAULT NOW();

-- One-off correction: this row's started_at was left at an accidental reread's
-- timestamp (2026-08-28) after a manual current_read_through/read_history fix
-- for an unrelated bug. Restored from the surviving read_history entry:
-- started_at = read_through #1's completed_at (a reread ends the prior run and
-- starts the new one at the same instant); created_at = read_through #1's
-- started_at (the true first-ever add, predating the bug entirely).
UPDATE user_novel_meta SET
  started_at = '2026-08-26T20:55:34.073Z',
  created_at = '2025-11-20T13:17:57.959Z'
WHERE user_id = 'demo-user'
  AND novel_id = 'novelbin:my-medical-skills-give-me-experience-points';
