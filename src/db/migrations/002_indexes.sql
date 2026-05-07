-- Performance indexes.
-- CONCURRENTLY cannot run inside a transaction — the runner handles this.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_progress_user_novel ON progress_snapshots (user_id, novel_id, created_at DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_progress_device ON progress_snapshots (device_id, novel_id, created_at DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_progress_created_at ON progress_snapshots (created_at DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_progress_read_through ON progress_snapshots (user_id, novel_id, read_through_num, created_at DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bookmarks_user_novel ON bookmarks (user_id, novel_id, created_at DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sessions_user ON reading_sessions (user_id, start_time DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sessions_novel ON reading_sessions (novel_id, start_time DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sessions_device ON reading_sessions (device_id, start_time DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_devices_user_active ON devices (user_id, active, last_seen DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_novel_meta_status ON user_novel_meta (user_id, status, updated_at DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_novel_notes_user_novel ON novel_notes (user_id, novel_id, created_at DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_novel_categories_user ON novel_categories (user_id, category);
