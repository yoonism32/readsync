-- A sync may wait behind a manual correction's row lock. Timestamp it when
-- inserted, not when its transaction began, so the new bookmark is visible.
ALTER TABLE progress_snapshots ALTER COLUMN created_at SET DEFAULT clock_timestamp();
