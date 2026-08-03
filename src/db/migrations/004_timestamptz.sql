-- All timestamp columns were created as TIMESTAMP (without time zone) by the
-- legacy schema. Values are UTC wall-clock times written by NOW() on UTC
-- servers. Timestamps serialized inside SQL (row_to_json/json_build_object in
-- the novels list endpoint) therefore carried no offset marker, and browsers
-- in non-UTC timezones parsed them as local time — e.g. "1h ago" shown for a
-- 2-minute-old read in GMT+1. Converting to TIMESTAMPTZ (interpreting stored
-- values as UTC) makes every serialization carry an explicit offset.
-- NOTE: the migration runner splits on every semicolon, so comments must
-- never contain one.

ALTER TABLE bookmarks ALTER COLUMN created_at TYPE timestamptz USING created_at AT TIME ZONE 'UTC';
ALTER TABLE devices ALTER COLUMN created_at TYPE timestamptz USING created_at AT TIME ZONE 'UTC';
ALTER TABLE devices ALTER COLUMN last_seen TYPE timestamptz USING last_seen AT TIME ZONE 'UTC';
ALTER TABLE notifications ALTER COLUMN created_at TYPE timestamptz USING created_at AT TIME ZONE 'UTC';
ALTER TABLE novel_categories ALTER COLUMN created_at TYPE timestamptz USING created_at AT TIME ZONE 'UTC';
ALTER TABLE novel_notes ALTER COLUMN created_at TYPE timestamptz USING created_at AT TIME ZONE 'UTC';
ALTER TABLE novel_notes ALTER COLUMN updated_at TYPE timestamptz USING updated_at AT TIME ZONE 'UTC';
-- novel_notifications was a legacy-server table with no CREATE statement in
-- this tree, its ALTER made every fresh-database migration run fail
ALTER TABLE novels ALTER COLUMN chapters_updated_at TYPE timestamptz USING chapters_updated_at AT TIME ZONE 'UTC';
ALTER TABLE novels ALTER COLUMN created_at TYPE timestamptz USING created_at AT TIME ZONE 'UTC';
ALTER TABLE novels ALTER COLUMN site_latest_chapter_time TYPE timestamptz USING site_latest_chapter_time AT TIME ZONE 'UTC';
ALTER TABLE progress_snapshots ALTER COLUMN created_at TYPE timestamptz USING created_at AT TIME ZONE 'UTC';
ALTER TABLE reading_sessions ALTER COLUMN created_at TYPE timestamptz USING created_at AT TIME ZONE 'UTC';
ALTER TABLE reading_sessions ALTER COLUMN end_time TYPE timestamptz USING end_time AT TIME ZONE 'UTC';
ALTER TABLE reading_sessions ALTER COLUMN start_time TYPE timestamptz USING start_time AT TIME ZONE 'UTC';
ALTER TABLE user_novel_meta ALTER COLUMN completed_at TYPE timestamptz USING completed_at AT TIME ZONE 'UTC';
ALTER TABLE user_novel_meta ALTER COLUMN started_at TYPE timestamptz USING started_at AT TIME ZONE 'UTC';
ALTER TABLE user_novel_meta ALTER COLUMN updated_at TYPE timestamptz USING updated_at AT TIME ZONE 'UTC';
ALTER TABLE user_settings ALTER COLUMN updated_at TYPE timestamptz USING updated_at AT TIME ZONE 'UTC';
ALTER TABLE users ALTER COLUMN created_at TYPE timestamptz USING created_at AT TIME ZONE 'UTC';
