-- A manual chapter/percent correction establishes a bookmark but is not a
-- reading event. This optional per-novel timestamp lets the owner preserve or
-- correct the displayed last-read time without falsifying snapshot chronology
-- or undoing the progress-reset cutoff.
ALTER TABLE user_novel_meta
  ADD COLUMN IF NOT EXISTS last_read_at TIMESTAMPTZ;
