-- Fixes the remaining bottleneck in the My List query (see 008 for the first
-- pass). pg_stat_statements showed this query at 82 percent of all database
-- time (574ms mean, 1210 calls) - 2667ms measured directly against
-- production for a 50-row page. The latest_per_device_json subquery was the
-- cause: it used DISTINCT ON (device_id), which cannot stop early within a
-- device's group even though idx_progress_device_latest already matched its
-- sort order. Production has read-throughs with 1000+ snapshots, so each of
-- the ~10 devices cost a walk through the whole group. Measured: 70.5
-- million index tuples read across 207,000 scans of idx_progress_device_latest.
--
-- No new index was needed. idx_progress_device_latest (user_id, novel_id,
-- read_through_num, device_id, created_at DESC) already covers this - the
-- fix is entirely in src/routes/novels.ts (GET /api/v1/novels): the
-- DISTINCT ON subquery was rewritten as CROSS JOIN LATERAL ... LIMIT 1 per
-- device, which the planner turns into an Index Scan + Limit 1 instead of a
-- scan of every snapshot in the group. Verified with EXPLAIN ANALYZE against
-- production: 2667ms -> 36ms for the same 50-row page.
--
-- (An index on (device_id, novel_id, read_through_num, created_at DESC) was
-- tried first and dropped - the planner picked idx_progress_device_latest
-- instead since all four predicates are equalities, so a second index with
-- the same columns in different leading order added nothing but write
-- overhead on this high-write table.)
--
-- Also picks up the remaining advisor-flagged foreign keys without a
-- covering index. Cheap now while these tables are small (0-179 rows);
-- mainly protects FK constraint checks (novel deletes) from degrading as
-- data grows.
--
-- CONCURRENTLY keeps writes flowing while these build. The migration runner
-- detects it and runs the file outside a transaction.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_progress_snapshots_novel_id
  ON public.progress_snapshots (novel_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bookmarks_novel_id
  ON public.bookmarks (novel_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notifications_novel_id
  ON public.notifications (novel_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_novel_categories_novel_id
  ON public.novel_categories (novel_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_novel_notes_novel_id
  ON public.novel_notes (novel_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_novel_notifications_novel_id
  ON public.novel_notifications (novel_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_novel_meta_novel_id
  ON public.user_novel_meta (novel_id);
