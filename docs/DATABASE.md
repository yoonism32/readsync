# Database

Postgres, Supabase-hosted. Schema is defined by 14 sequential migrations in
`src/db/migrations/`, run by `src/db/migrate.ts` on server startup.

## Tables

| Table | Added in | Purpose |
|---|---|---|
| `users` | 001 | Accounts; holds `api_key` (data-plane auth) |
| `devices` | 001 | Per-user device registry |
| `novels` | 001 (`synopsis`/`synopsis_imported_at` added in 013) | Novel metadata: title, URL, latest chapter, genre, author, cover, one-time-imported NovelArrow synopsis |
| `progress_snapshots` | 001 | One row per sync event — the raw read-progress log |
| `user_novel_meta` | 001 (`created_at` added in 014) | Per-user-per-novel status (reading/completed/on-hold/dropped/plan-to-read/removed), favorite flag, half-star `rating` (011), true first-added `created_at` distinct from reread-overwritten `started_at` (014) |
| `bookmarks` | 001 | User bookmarks within a novel |
| `reading_sessions` | 001 | Session grouping over `progress_snapshots` (30-min idle timeout) |
| `novel_notes` | 001 | Free-text notes per novel |
| `user_settings` | 001 | Key/value user preferences |
| `novel_categories` | 001 | User-defined tags on novels |
| `notifications` | 001 (re-created idempotently in 006) | In-app notification feed (e.g. "N new chapters") |
| `session` | 009 | `express-session` store (via `connect-pg-simple`) — not application data |

## Migration history

- **001 — initial schema.** Baseline; existing Supabase databases are marked as having this applied on first run.
- **002 — performance indexes.** `CONCURRENTLY`-created indexes on `progress_snapshots` and related tables.
- **003 — NovelArrow URL migration.** NovelBin moved to `novelarrow.com` with a new URL grammar (`/b/<slug>` → `/novel/<slug>`, chapter URLs gained a title slug). Rewrites stored `primary_url` values across mirrors; novel IDs keep the legacy `novelbin:` prefix for continuity.
- **004 — TIMESTAMPTZ conversion.** Legacy columns were `TIMESTAMP` (no timezone), written as UTC wall-clock time by `NOW()`. Client-side relative-time formatting silently misread these in non-UTC timezones (e.g. "1h ago" for a 2-minute-old read in GMT+1). Converted to `TIMESTAMPTZ` so every serialized value carries an explicit offset.
- **005 — widen the status constraint.** The Manage page offered `plan-to-read` as a status before the DB `CHECK` constraint allowed it, so every attempt 500'd. Widened on the live database; 001 updated in the same commit for fresh installs.
- **006 — notifications table (idempotent re-create).** The table was added to 001 after that migration had already run in production, so existing databases never got it (migrations are tracked by filename, not diffed). `CREATE TABLE IF NOT EXISTS` covers both fresh and existing installs.
- **007 — RLS lockdown.** Supabase's PostgREST exposes the `public` schema by default, and the anon key is publishable by design — every table here had RLS disabled with `anon` granted full CRUD, so the anon key alone could read or truncate the whole reading history (verified live before the fix). Enables RLS with no policies (default-deny) and revokes `anon`/`authenticated` grants. See [ARCHITECTURE.md](./ARCHITECTURE.md#rls-lockdown) for why this doesn't affect the app's own queries.
- **008 — first My List perf pass.** `GET /api/v1/novels` was 60% of all database time: two correlated subqueries per novel scanned every snapshot for that novel/read-through combination (589 rows in production) and sorted in-memory, unable to use the existing index because it ordered by different columns. Added indexes matching the actual sort order.
- **009 — session store.** `app.ts` configured `express-session` with no store, so it silently fell back to in-process `MemoryStore` — sessions were wiped on every deploy and every free-tier hibernation. Since `requireAuthAPI` only checks `req.session.authenticated`, this surfaced as pages loading fine while every API call returned 401 (reads as a broken app, not a logout). Moved sessions into Postgres via `connect-pg-simple`, schema owned by this migration.
- **010 — second My List perf pass (the big one).** Even after 008, `pg_stat_statements` showed this query at 82% of all database time (574ms mean, 1210 calls; 2667ms measured directly in production for a 50-row page). Root cause: the `latest_per_device_json` subquery used `DISTINCT ON (device_id)`, which can't stop early within a device's group even with a matching index — production read-throughs have 1000+ snapshots, so each of the ~10 devices per novel cost a full walk. Rewrote as a `LATERAL` join with `LIMIT 1` per device, backed by new covering indexes. **Result: 2667ms → 36ms, a 74× speedup.**
- **011 — half-star ratings.** `user_novel_meta.rating` was `INTEGER CHECK (1-5)` with no user-facing write path (only the backup-restore importer wrote it). Shipping a half-star rating UI needs 0.5 increments, which the integer column rejected outright. Converted to `NUMERIC(2,1)`, `NULL` still means "unrated," and the `CHECK` constrains to the 0.5–5.0 half-star grid (`rating * 2 = ROUND(rating * 2)` rejects off-grid values like 2.3).
- **012 — notifications `(user_id, created_at DESC)` index.** Supabase's Index Advisor flagged `GET /api/v1/notifications` as unindexed after the 08-18 `pg_stat_statements` reset. The existing `idx_notifications_user_unread` (006) doesn't cover this query — `read` sits between `user_id` and `created_at` in that index, breaking the sort guarantee, so the planner fell back to Seq Scan + Sort (1.516ms). This index lets it use Index Scan Backward instead (0.238ms on the current 548-row table; the real win is avoiding Seq Scan + Sort as the table grows). Built `CONCURRENTLY`; applied directly to production 2026-08-18 to unblock verification, this file exists so schema-as-code matches prod.
- **013 — NovelArrow synopsis columns.** Adds `novels.synopsis` (`TEXT`) and `novels.synopsis_imported_at` (`TIMESTAMPTZ`) for the one-time-imported synopsis feature (see [ROADMAP.md](./ROADMAP.md)) — fetched once when missing, never overwritten by Refresh All or a recurring scan. Kept separate from the existing `description` column (user import/export field, `src/routes/novels.ts`) so scraped synopsis text can't collide with that feature's meaning.
- **014 — `user_novel_meta.created_at`, decoupled from `started_at`.** The My List "Added" column/sort read `started_at`, which every reread (manual or auto-detected) unconditionally overwrites with `CURRENT_TIMESTAMP` — a reread silently corrupted "Added" for any novel. Adds a real `created_at`, set once and never touched by a reread; backfilled from the earliest `read_history` entry's `started_at` where history exists, else the existing `started_at`. Includes a one-off data correction for a single production row (`novelbin:my-medical-skills-give-me-experience-points`) whose `started_at` had been left at an accidental reread's timestamp during an unrelated manual fix.

## Recovering from a failed migration

`src/db/migrate.ts` only records a migration as applied (`schema_migrations`
insert) *after* it finishes, so a failure always leaves the runner safe to
retry on the next deploy — but the two migration styles fail differently:

- **Transactional migrations** (the default — no `CONCURRENTLY` statement)
  run inside a single `BEGIN`/`COMMIT`. On any statement error the runner
  issues `ROLLBACK` itself (`migrate.ts:55`), so the database is left exactly
  as it was before the migration started. Fix the `.sql` file (never edit a
  file that has already shipped to production — add a new numbered one) and
  redeploy; the runner retries it automatically since it was never marked
  applied.
- **`CONCURRENTLY` migrations** (002, 012) run each statement directly against
  the pool with no wrapping transaction, because Postgres refuses
  `CONCURRENTLY` inside one. A failure partway through leaves earlier
  statements in that file already committed, and the whole file still
  unmarked as applied — so the next run retries from the top and can hit
  "already exists" on the objects that did succeed. Recovery is manual:
  inspect what the failed statements actually created (`\d <table>` /
  `\di <index>` in `psql`), either drop the partial objects or make the
  migration idempotent (`IF NOT EXISTS`) for the retry, then redeploy.

To force a manual retry of a specific migration without a new deploy, delete
its row from `schema_migrations` (`DELETE FROM schema_migrations WHERE name =
'0XX_name.sql'`) — the runner treats it as never-applied and reruns the file
from `src/db/migrations/` on the next `runMigrations()` call.

## Schema drift: `progress_snapshots.id` is `integer`, not `bigint`

Found 2026-09-04. Both `src/db/schema.ts:57` and
`001_initial_schema.sql:42` declare `id BIGSERIAL`, but the live column is
`integer` (`int4`). The live table predates that declaration, and every
definition uses `CREATE TABLE IF NOT EXISTS` — which silently no-ops against
an existing table and never alters it. `notifications.id` is `integer` too,
but that one is correct: it's declared `SERIAL` in both `001` and `006`.

**Not worth migrating.** `int4` tops out at 2,147,483,647; the table is at
139,851, and even at August 2026's rate (~66k rows/month) that is roughly
2,600 years of headroom. `ALTER TABLE ... TYPE bigint` would rewrite the
whole table and lock it for no practical gain.

**What it does cost:** a fresh deploy that runs migrations from scratch
builds `bigint`, so a restored or newly provisioned environment does not
match production. Keep it in mind when comparing environments, and know that
this class of drift is invisible to the migration runner — `IF NOT EXISTS`
means a changed column type in a migration file is never applied to an
existing table. Any future column-type change needs an explicit
`ALTER TABLE` migration, not an edited `CREATE TABLE`.

## Known dead config

`.env.example` lists `BOT_DISABLED`, `API_KEY`, and `SUPABASE_ANON_KEY` —
none is read anywhere in `src/` or `bot/` today (confirmed by grep). The
first two are vestigial from an earlier version of the auth/bot design;
the actual bot-off mechanism is described in
[ARCHITECTURE.md](./ARCHITECTURE.md#the-bot-is-intentionally-off-in-production),
and the actual data-plane auth is the per-user `api_key` column on `users`,
not an env var. `SUPABASE_ANON_KEY` was never wired up — the only Supabase
credential the backend actually uses is `SUPABASE_SERVICE_KEY` (Storage
access in `BackupService.ts`/`covers.ts`); the `SUPABASE_KEY` export in
`config.ts` that fell back to it was deleted as dead code alongside this.
