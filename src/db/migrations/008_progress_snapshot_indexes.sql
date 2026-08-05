-- Speed up the My List query, which was 60 percent of all database time.
--
-- GET /api/v1/novels runs two correlated subqueries per novel. Each one read
-- every snapshot for that novel and read-through - 589 rows in production - then
-- sorted them to return a single row. Neither could use the existing
-- idx_progress_read_through for ordering, because that index ends in created_at
-- while the subqueries sort by other columns.
--
-- These two indexes match each subquery's ORDER BY exactly, so the sorts
-- disappear and the top-chapter lookup stops early on its LIMIT 1. Measured on
-- production: 300ms and 31354 buffers before, 108ms and 11853 buffers after,
-- together with a one-off VACUUM that rebuilt the visibility map (the CTE was
-- doing 62735 heap fetches from a supposedly index-only scan).
--
-- CONCURRENTLY keeps writes flowing while these build. The migration runner
-- detects it and runs the file outside a transaction.
--
-- Style note: the runner splits this file on semicolons, so no DO blocks and no
-- semicolons inside comments.

-- Serves the DISTINCT ON (device_id) ORDER BY device_id, created_at DESC
-- subquery that builds latest_per_device_json.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_progress_device_latest
  ON public.progress_snapshots (user_id, novel_id, read_through_num, device_id, created_at DESC);

-- Serves the ORDER BY chapter_num DESC, percent DESC, created_at DESC LIMIT 1
-- subquery that builds latest_global_json.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_progress_top_chapter
  ON public.progress_snapshots (user_id, novel_id, read_through_num, chapter_num DESC, percent DESC, created_at DESC);
