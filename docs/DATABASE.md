# Database

Postgres, Supabase-hosted. Schema is defined by 20 sequential migrations in
`src/db/migrations/`. They are applied by `runMigrations()` (`src/db/migrate.ts`),
which `src/server.ts` calls on every startup before the server listens.

## Tables

| Table | Added in | Purpose |
|---|---|---|
| `users` | 001 | Accounts. `api_key` holds only the SHA-256 hash (`sha256:…`) of an optional key issued through `POST /api/auth/api-key`, or `revoked:<id>` after 015. The main userscript key is the `API_KEY` env value, which is checked first and never stored here |
| `devices` | 001 (unique `(user_id, id)` index in 017) | Per-user device registry |
| `novels` | 001 (`synopsis`/`synopsis_imported_at` added in 013) | Novel metadata: title, URL, latest chapter, genre, author, cover, one-time-imported NovelArrow synopsis |
| `progress_snapshots` | 001 (`import_key` 016, device-owner FK 017, `created_at` default `clock_timestamp()` 018) | One row per sync event — the raw read-progress log |
| `user_novel_meta` | 001 (`created_at` 014, `progress_reset_at` 016, `last_read_at` 019) | Per-user-per-novel status (reading/completed/on-hold/dropped/plan-to-read/removed), favorite flag, `read_history` JSONB of past read-throughs, half-star `rating` (011), true first-added `created_at` distinct from reread-overwritten `started_at` (014), manual-correction cutoff `progress_reset_at` (016), manual last-read override `last_read_at` (019) |
| `bookmarks` | 001 (`import_key` 016) | User bookmarks within a novel |
| `reading_sessions` | 001 (`import_key` 016, device-owner FK 017) | Session grouping over `progress_snapshots` (30-min idle timeout) |
| `novel_notes` | 001 (`import_key` 016) | Free-text notes per novel |
| `user_settings` | 001 | Key/value user preferences |
| `novel_categories` | 001 | User-defined tags on novels |
| `notifications` | 001 (re-created idempotently in 006, `import_key` 016) | In-app notification feed (e.g. "N new chapters") |
| `session` | 009 | `express-session` store (via `connect-pg-simple`) — not application data; RLS enabled |
| `schema_migrations` | `migrate.ts` | Migration bookkeeping: `name` (filename, PK) and `applied_at`. Created by the runner, not by a migration file |

`import_key` (016) is a per-user unique identity for restored records, so
re-importing the same export is idempotent instead of duplicating rows.

## Migration history

- **001 — initial schema.** Baseline for fresh installs. The file's header says existing Supabase databases are "marked applied via the baseline", but `migrate.ts` has no baseline step. A database that predates the runner needs a manual `INSERT INTO schema_migrations (name) VALUES ('001_initial_schema.sql')`.
- **002 — performance indexes.** `CONCURRENTLY`-created indexes on `progress_snapshots` and related tables.
- **003 — NovelArrow URL migration.** NovelBin moved to `novelarrow.com` with a new URL grammar (`/b/<slug>` → `/novel/<slug>`, chapter URLs gained a title slug). Rewrites stored `primary_url` values across mirrors; novel IDs keep the legacy `novelbin:` prefix for continuity.
- **004 — TIMESTAMPTZ conversion.** Legacy columns were `TIMESTAMP` (no timezone), written as UTC wall-clock time by `NOW()`. Client-side relative-time formatting silently misread these in non-UTC timezones (e.g. "1h ago" for a 2-minute-old read in GMT+1). Converted to `TIMESTAMPTZ` so every serialized value carries an explicit offset.
- **005 — widen the status constraint.** The Manage page offered `plan-to-read` as a status before the DB `CHECK` constraint allowed it, so every attempt 500'd. Widened on the live database; 001 updated in the same commit for fresh installs.
- **006 — notifications table (idempotent re-create).** The table was added to 001 after that migration had already run in production, so existing databases never got it (migrations are tracked by filename, not diffed). `CREATE TABLE IF NOT EXISTS` covers both fresh and existing installs.
- **007 — RLS lockdown.** Supabase's PostgREST exposes the `public` schema by default, and the anon key is publishable by design — every table here had RLS disabled with `anon` granted full CRUD, so the anon key alone could read or truncate the whole reading history (verified live before the fix). Enables RLS with no policies (default-deny) and revokes `anon`/`authenticated` grants. See [ARCHITECTURE.md](./ARCHITECTURE.md#rls-lockdown) for why this doesn't affect the app's own queries.
- **008 — first My List perf pass.** `GET /api/v1/novels` was 60% of all database time: two correlated subqueries per novel scanned every snapshot for that novel/read-through combination and sorted in-memory, unable to use the existing index because it ordered by different columns. Added indexes matching the actual sort order.
- **009 — session store.** `app.ts` configured `express-session` with no store, so it silently fell back to in-process `MemoryStore` — sessions were wiped on every deploy and every free-tier hibernation. Since `requireAuthAPI` only checks `req.session.authenticated`, this surfaced as pages loading fine while every API call returned 401 (reads as a broken app, not a logout). Moved sessions into Postgres via `connect-pg-simple`, schema owned by this migration.
- **010 — second My List perf pass (the big one).** Even after 008, `pg_stat_statements` showed this query at 82% of all database time (the dominant query by total time). Root cause: the `latest_per_device_json` subquery used `DISTINCT ON (device_id)`, which can't stop early within a device's group even with a matching index — long read-throughs have many snapshots, so each device per novel cost a full walk. Rewrote as a `LATERAL` join with `LIMIT 1` per device, backed by new covering indexes. **Result: 2667ms → 36ms, a 74× speedup.**
- **011 — half-star ratings.** `user_novel_meta.rating` was `INTEGER CHECK (1-5)` with no user-facing write path (only the backup-restore importer wrote it). Shipping a half-star rating UI needs 0.5 increments, which the integer column rejected outright. Converted to `NUMERIC(2,1)`, `NULL` still means "unrated," and the `CHECK` constrains to the 0.5–5.0 half-star grid (`rating * 2 = ROUND(rating * 2)` rejects off-grid values like 2.3).
- **012 — notifications `(user_id, created_at DESC)` index.** Supabase's Index Advisor flagged `GET /api/v1/notifications` as unindexed after the 08-18 `pg_stat_statements` reset. The existing `idx_notifications_user_unread` (006) doesn't cover this query — `read` sits between `user_id` and `created_at` in that index, breaking the sort guarantee, so the planner fell back to Seq Scan + Sort (1.516ms). This index lets it use Index Scan Backward instead. Built `CONCURRENTLY`; applied directly to production 2026-08-18 to unblock verification, this file exists so schema-as-code matches prod.
- **013 — NovelArrow synopsis columns.** Adds `novels.synopsis` (`TEXT`) and `novels.synopsis_imported_at` (`TIMESTAMPTZ`) for the one-time-imported synopsis feature (see [ROADMAP.md](./ROADMAP.md)) — fetched once when missing, never overwritten by Refresh All or a recurring scan. Kept separate from the existing `description` column (user import/export field, `src/routes/novels.ts`) so scraped synopsis text can't collide with that feature's meaning.
- **014 — `user_novel_meta.created_at`, decoupled from `started_at`.** The My List "Added" column/sort read `started_at`, which every reread (manual or auto-detected) unconditionally overwrites with `CURRENT_TIMESTAMP` — a reread silently corrupted "Added" for any novel. Adds a real `created_at`, set once and never touched by a reread; backfilled from the earliest `read_history` entry's `started_at` where history exists, else the existing `started_at`. Includes a one-off data correction for a single production row (`novelbin:sample-skills-give-me-points`) whose `started_at` had been left at an accidental reread's timestamp during an unrelated manual fix.
- **015 — revoke published keys.** Part of the 2026-09-11 security remediation. Sets every `users.api_key` to `revoked:<id>` and deletes all rows from `session`, so keys and sessions from before binding stop working. Deploying it signs everyone out. It does not touch the `API_KEY` env value. See [SECURITY-REMEDIATION-2026-09-11.md](./SECURITY-REMEDIATION-2026-09-11.md).
- **016 — import identity and progress reset.** Adds `user_novel_meta.progress_reset_at`, the cutoff a downward manual correction sets without deleting history. Also adds `import_key` with a unique `(user_id, import_key)` index on `progress_snapshots`, `bookmarks`, `novel_notes`, `reading_sessions` and `notifications`, for idempotent, atomic restore.
- **017 — device ownership.** A unique `(user_id, id)` index on `devices`, plus composite foreign keys `progress_device_owner` and `sessions_device_owner` (`(user_id, device_id) → devices(user_id, id)`). The keys are added `NOT VALID`: new writes are enforced immediately, but old rows are not checked. Review historical mismatches before running `VALIDATE CONSTRAINT`.
- **018 — snapshot write time.** `progress_snapshots.created_at` defaults to `clock_timestamp()` instead of the transaction start time. A sync that waited behind a manual correction's row lock is then stamped after that correction, so the new bookmark is visible.
- **019 — manual last-read override.** Adds `user_novel_meta.last_read_at`, an optional override for the displayed last-read time. A manual chapter/percent correction is not a reading event, so it doesn't create snapshots or undo the progress-reset cutoff.
- **020 — NovelPing URLs.** Rewrites `novels.primary_url` from `novelarrow.com/(novel|chapter)/<slug>` to `https://novelping.com/novel/<slug>`. Snapshot and bookmark URLs are deliberately left as they are; they are healed at read time by `NovelService.healDeadSiteUrl`. See [NOVELPING_MIGRATION.md](./NOVELPING_MIGRATION.md).

## Recovering from a failed migration

`src/db/migrate.ts` only records a migration as applied (`schema_migrations`
insert) *after* it finishes, so a failure always leaves the runner safe to
retry on the next deploy — but the two migration styles fail differently:

- **Transactional migrations** (the default — no `CONCURRENTLY` statement)
  run inside a single `BEGIN`/`COMMIT`. On any statement error the runner
  issues `ROLLBACK` itself (`migrate.ts:72`), so the database is left exactly
  as it was before the migration started. Fix the `.sql` file (never edit a
  file that has already shipped to production — add a new numbered one) and
  redeploy; the runner retries it automatically since it was never marked
  applied. Each transactional migration first takes
  `pg_advisory_xact_lock(hashtext('readsync:migrations'))` and re-checks
  `schema_migrations` inside the transaction. That makes two instances booting
  at once safe: the second one waits, then skips.
- **`CONCURRENTLY` migrations** (002, 008, 010, 012) run each statement directly against
  the pool with no wrapping transaction, because Postgres refuses
  `CONCURRENTLY` inside one. A failure partway through leaves earlier
  statements in that file already committed, and the whole file still
  unmarked as applied — so the next run retries from the top and can hit
  "already exists" on the objects that did succeed. Recovery is manual:
  inspect what the failed statements actually created (`\d <table>` /
  `\di <index>` in `psql`), either drop the partial objects or make the
  migration idempotent (`IF NOT EXISTS`) for the retry, then redeploy. These files take no lock, and are recorded with
  `ON CONFLICT DO NOTHING` once every statement succeeds.

Statements are split by `src/db/sqlSplitter.ts`. A file is treated as
`CONCURRENTLY` if any of its statements contains that word.

To force a manual retry of a specific migration without a new deploy, delete
its row from `schema_migrations` (`DELETE FROM schema_migrations WHERE name =
'0XX_name.sql'`) — the runner treats it as never-applied and reruns the file
from `src/db/migrations/` on the next `runMigrations()` call.

## Schema drift: `progress_snapshots.id` is `integer`, not `bigint`

Found 2026-09-04. `001_initial_schema.sql:42` declares `id BIGSERIAL`, but the live column is
`integer` (`int4`). The live table predates that declaration, and every
definition uses `CREATE TABLE IF NOT EXISTS` — which silently no-ops against
an existing table and never alters it. `notifications.id` is `integer` too,
but that one is correct: it's declared `SERIAL` in both `001` and `006`.

**Not worth migrating.** `int4` tops out at 2,147,483,647; current growth
leaves effectively unlimited headroom. `ALTER TABLE ... TYPE bigint` would rewrite the
whole table and lock it for no practical gain.

**What it does cost:** a fresh deploy that runs migrations from scratch
builds `bigint`, so a restored or newly provisioned environment does not
match production. Keep it in mind when comparing environments, and know that
this class of drift is invisible to the migration runner — `IF NOT EXISTS`
means a changed column type in a migration file is never applied to an
existing table. Any future column-type change needs an explicit
`ALTER TABLE` migration, not an edited `CREATE TABLE`.

## Adding a migration

1. Create `src/db/migrations/0NN_short_name.sql` with the next number.
   Filenames sort lexicographically, so keep the three-digit prefix.
2. Never edit a file that has already run anywhere. A changed
   `CREATE TABLE IF NOT EXISTS` is silently ignored on existing databases
   (see the drift section below). Write an explicit `ALTER` in a new file.
3. Don't mix `CONCURRENTLY` index builds with other DDL in one file. The
   whole file loses its transaction. Make those statements `IF NOT EXISTS`
   so a retry is safe.
4. Add an entry to the history above and update the Tables section.
5. `npm run build` copies the SQL into `dist/db/migrations/`. The server
   applies it on its next start.

## Credentials and config notes

`API_KEY` is read by the backend authentication middleware as the single-user key.
The database `users.api_key` column remains the storage for optional issued
keys, which are kept as hashes. `SUPABASE_ANON_KEY` is still not wired up — the
only Supabase credential the backend actually uses is `SUPABASE_SERVICE_KEY`
(Storage access in `BackupService.ts`/`covers.ts`); the `SUPABASE_KEY` export in
`config.ts` that fell back to it was deleted as dead code. `BOT_DISABLED` was
dropped with the removed bot; see [ARCHITECTURE.md](./ARCHITECTURE.md#the-bot-was-removed).
