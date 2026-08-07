# Database

Postgres, Supabase-hosted. Schema is defined by 10 sequential migrations in
`src/db/migrations/`, run by `src/db/migrate.ts` on server startup.

## Tables

| Table | Added in | Purpose |
|---|---|---|
| `users` | 001 | Accounts; holds `api_key` (data-plane auth) |
| `devices` | 001 | Per-user device registry |
| `novels` | 001 | Novel metadata: title, URL, latest chapter, genre, author, cover |
| `progress_snapshots` | 001 | One row per sync event — the raw read-progress log |
| `user_novel_meta` | 001 | Per-user-per-novel status (reading/completed/on-hold/dropped/plan-to-read/removed), favorite flag |
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

## Known dead config

`.env.example` lists `BOT_DISABLED` and `API_KEY` — neither is read anywhere
in `src/` or `bot/` today (confirmed by grep). They're vestigial from an
earlier version of the auth/bot design; the actual bot-off mechanism is
described in [ARCHITECTURE.md](./ARCHITECTURE.md#the-bot-is-intentionally-off-in-production),
and the actual data-plane auth is the per-user `api_key` column on `users`,
not an env var.
