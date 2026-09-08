# Architecture

Current state of the system as of 2026-08. This document exists because
the codebase went through a full TypeScript/React rewrite and none of the
older docs were updated to match — see the git history and
[ROADMAP.md](./ROADMAP.md) for how it got here.

## Stack

| Layer | Tech | Location |
|---|---|---|
| Backend API | Node.js, Express 5, TypeScript | `src/` → compiled to `dist/` |
| Frontend | React 19, React Router 7, Vite, Tailwind 4, SWR | `frontend/` → served at `/app` |
| Browser client | Userscript (Vite-built IIFE, GM-API based — works in Tampermonkey/Violentmonkey) | `userscript/` → `dist-userscript/readsync.user.js` |
| Chapter-update bot | **Removed 2026-09-08** | see below |
| Database | Postgres (Supabase-hosted) | 14 migrations in `src/db/migrations/` |
| Realtime | Socket.IO | wired into `src/app.ts` |

The only deployed entrypoint is `dist/server.js` (compiled from
`src/server.ts`) — confirmed by `render.yaml` (`startCommand: node
dist/server.js`) and the Dockerfile's production stage, which copies only
`dist/`, `public/`, and pruned `node_modules`.

## Data flow: reading progress sync

1. The userscript (`userscript/src/main.ts`) runs on `novelarrow.com` and
   `novelbin.{com,me,net,org}` chapter pages, tracks scroll position, and
   debounce-syncs to the backend.
2. `POST /api/v1/progress` (`src/routes/progress.ts`), authenticated via a
   per-user `api_key`, runs one DB transaction: upserts the device, upserts
   the novel and `user_novel_meta`, applies a max-progress policy (rejects
   same-chapter-lower-percent / behind-chapter / restart-noise updates),
   writes a `progress_snapshots` row, and maintains a `reading_sessions` row
   (30-minute idle timeout closes a session).
3. The route emits `progress:updated` over Socket.IO to that user's
   `user:{id}` room. `POST /api/v1/admin/novels/auto-update`
   (`src/routes/admin.ts`, called by the userscript during the "Refresh All
   Novels" flow) emits a second event, `chapters:updated`, to the same room
   whenever it detects a new chapter — both are wired via a router-factory
   pattern (`createProgressRouter(io)` / `createAdminRouter(io)` in
   `src/app.ts`), matching try/catch style so a WebSocket hiccup never fails
   the HTTP response the userscript is waiting on.
4. The React SPA consumes both events: `frontend/src/hooks/useSocket.ts`
   opens one Socket.IO connection per authenticated tab (reusing the same
   `api_key` as HTTP auth), and `frontend/src/components/Layout.tsx` — the
   single mount point shared by every routed page — subscribes to
   `chapters:updated` and `progress:updated`, calling SWR's
   `mutate('/novels')` on either. This is deliberately invalidation-only:
   neither event patches state directly, so the existing `/novels` SWR
   cache stays the single source of truth. Dashboard/Explorer/Manage/MyList
   still poll `/api/v1/novels` as a fallback, but at 30 minutes instead of
   3 — a safety net for a silently-dead socket (e.g. a proxy that kills
   idle WebSockets without a clean `disconnect`), not the primary update
   path anymore. The 3-minute interval had itself contributed to a Supabase
   egress warning (2026-08-12); see [ROADMAP.md](./ROADMAP.md) for that
   incident writeup.
5. The React SPA (`frontend/`) reads the same data via SWR hooks hitting the
   `/api/v1/*` endpoints, and receives the same WebSocket events.

## Auth — two tiers, deliberately different

| | Session cookie | API key |
|---|---|---|
| Guards | Browser dashboard/SPA page access | Every data-plane endpoint (`/api/v1/*`) |
| Mechanism | `express-session`, `requireAuth`/`requireAuthAPI` (`src/middleware/auth.ts`) | Per-user `api_key` column, `validateApiKey` middleware |
| Storage | Postgres-backed via `connect-pg-simple` (migration 009) — see why in [DATABASE.md](./DATABASE.md) | Sent as `user_key` in request body or query string |
| WebSocket | N/A | Same `api_key` lookup, `src/websocket/auth.ts` |

The admin password itself is a single `ADMIN_PASSWORD_HASH` env var
(bcrypt via `bcryptjs`), compared in `src/services/AuthService.ts`. Generate
a new hash locally with `node generate-password-hash.js YOUR_PASSWORD` —
that script is a one-off CLI tool, not part of the running server.

**Known weakness, not yet fixed:** both the frontend (`frontend/src/api/client.ts`)
and the userscript send the API key as a `?user_key=` query-string
parameter rather than a header. This leaks into server access logs and
`Referer` headers on outbound requests (e.g. cover-image fetches to
third-party hosts). Left as-is for now — see
[ROADMAP.md](./ROADMAP.md) if this gets picked up.

## Rate limiting — intentionally off

`express-rate-limit` is installed but not applied
(`src/app.ts`, `// Rate limiting DISABLED for personal use`). This is a
deliberate tradeoff for a low-traffic personal deployment, not an
oversight — documented here so it reads as a choice. Reconsider if this ever
serves more than a handful of users, or if the API key gets rotated to
something less exposed (see above).

## The bot was removed

`bot/src/` was a real, working Puppeteer-based scraper for chapter updates
on NovelArrow/NovelBin. It was **never wired into the deployed server** —
`src/routes/admin.ts` exported a `setBotModule()` injection hook that
`src/server.ts` never called, so every bot-gated admin route always
`503`'d in production — and it was deleted outright on 2026-09-08 rather
than kept as unreachable dead code. Removed along with it: `dist-bot/`, the
`bot` and `typecheck:bot` npm scripts, the `puppeteer-core` /
`puppeteer-extra` / `puppeteer-extra-plugin-stealth` / `@sparticuz/chromium`
dependencies, `src/services/BotService.ts`, and the bot-only admin routes
(`/bot/status`, `/bot/trigger`, `/novels/:novelId/update`,
`/novels/single-run`, `/bot/progress`, `/admin/force-refresh-all`) — see
[API_REFERENCE.md](./API_REFERENCE.md). The frontend's Admin page already
showed only a static "bot is off" note by this point, so nothing user-facing
changed.

**Why it was never turned on, for the record (production-network test,
2026-08-21):** an authenticated, read-only probe sent six NovelArrow
novel-page requests from the deployed ReadSync process in two batches of
three. All six received HTTP 403 Cloudflare challenges before any novel
metadata was returned. The same pages returned complete, parseable HTML from
a local connection, so this was an outbound-network/IP-reputation problem,
not a parser or batch-size problem — Puppeteer would still have originated
from Render's blocked network. Chapter refresh and one-time metadata imports
stay in the reader's real browser/userscript (see "Refresh All Novels" in
`frontend/src/hooks/useRefreshAll.ts`, which opens each novel's page in a
background tab so the userscript can scrape it live). If server-side
scraping is ever revisited, it would need a fresh implementation — the old
`bot/` code, including its Cloudflare-challenge detector (which false-
positived on the `challenge-platform` script present on normal pages), is
gone, not archived.

## RLS lockdown

Supabase exposes the `public` schema through PostgREST by default, with the
`anon` key able to read/write. Migration `007_rls_lockdown.sql` enables RLS
on every application table with **no policies** (own-table default-deny)
and revokes `anon`/`authenticated` grants. The app itself connects as the
table owner via the connection pooler, which bypasses RLS — so this is
purely a defense-in-depth measure against the PostgREST auto-exposure, not
something the app's own queries interact with.

## What's not covered here

- Full endpoint list and per-route auth/validation status: [API_REFERENCE.md](./API_REFERENCE.md)
- Schema and migration history: [DATABASE.md](./DATABASE.md)
- Env vars, Render/Docker runbook: [DEPLOYMENT.md](./DEPLOYMENT.md)
- What's tested and how to run it: [TESTING.md](./TESTING.md)
- Open backlog: [ROADMAP.md](./ROADMAP.md)
