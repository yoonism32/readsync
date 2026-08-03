-- The Manage page has offered 'plan-to-read' since the React port, but the
-- status CHECK constraint (and the route validators) rejected it, so every
-- attempt 500'd. Widen the constraint on the live database — 001 was updated
-- in the same commit for fresh installs.
-- NOTE: the migration runner splits on every semicolon, so comments must
-- never contain one.

ALTER TABLE user_novel_meta DROP CONSTRAINT user_novel_meta_status_check;
ALTER TABLE user_novel_meta ADD CONSTRAINT user_novel_meta_status_check CHECK (status IN ('reading', 'completed', 'on-hold', 'dropped', 'plan-to-read', 'removed'));
