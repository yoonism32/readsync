# Database

Postgres. Schema is defined by sequential migrations in
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

- **001** — initial schema.
- **002** — performance indexes (`CONCURRENTLY`).
- **003** — NovelArrow URL migration — rewrites stored `primary_url` values; novel IDs keep the `novelbin:` prefix.
- **004** — `TIMESTAMP` → `TIMESTAMPTZ` so every value carries an offset.
- **005** — widen the status `CHECK` to allow `plan-to-read`.
- **006** — notifications table (idempotent re-create).
- **007** — enable RLS with no policies and revoke `anon`/`authenticated` grants (defense in depth).
- **008** — My List indexes matching the actual sort order.
- **009** — Postgres-backed session store (`connect-pg-simple`).
- **010** — My List query rewritten as a `LATERAL ... LIMIT 1` join per device with covering indexes.
- **011** — half-star ratings (`NUMERIC(2,1)`, 0.5–5.0 grid).
- **012** — notifications `(user_id, created_at DESC)` index.
- **013** — `novels.synopsis` and `synopsis_imported_at`.
- **014** — `user_novel_meta.created_at`, decoupled from `started_at` so rereads don't reset "Added".

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
