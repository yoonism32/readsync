-- Supabase's Index Advisor flagged GET /api/v1/notifications (13 calls,
-- 548 rows, post-2026-08-18 pg_stat_statements reset) as unindexed and
-- recommended a plain btree(created_at) index (est. 89.69% cost reduction,
-- 75.87 -> 7.82). That recommendation ignores the query's WHERE user_id =
-- $1 filter, so it went with a composite index instead.
--
-- idx_notifications_user_unread (user_id, read, created_at DESC) already
-- exists (006_notifications.sql) but doesn't cover this query: it has no
-- `read` filter, and `read` sitting between user_id and created_at in that
-- index breaks the sort-order guarantee across read/unread groups, so the
-- planner falls back to Seq Scan + top-N heapsort (confirmed via EXPLAIN
-- ANALYZE against production: cost 65.70..65.75, actual 1.516ms for a
-- single-user 548-row table).
--
-- (user_id, created_at DESC) lets the same query use Index Scan Backward
-- with no sort step. Verified via EXPLAIN ANALYZE against production:
-- Seq Scan + Sort -> Index Scan using idx_notifications_user_created,
-- 1.516ms -> 0.238ms on the current 548-row table; the real win is
-- avoiding Seq Scan + Sort entirely as the table grows, same rationale as
-- 010's FK indexes.
--
-- CONCURRENTLY keeps writes flowing while it builds; the migration runner
-- detects it and runs the file outside a transaction. Already applied
-- directly to production on 2026-08-18 to unblock verification -- this
-- file exists so schema-as-code matches prod and fresh installs get it.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notifications_user_created
  ON public.notifications (user_id, created_at DESC);
