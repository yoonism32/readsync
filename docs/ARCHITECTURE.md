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
| Chapter-update bot | Puppeteer-extra + stealth, TypeScript | `bot/src/` — **not part of the deployed system, see below** |
| Database | Postgres (Supabase-hosted) | 10 migrations in `src/db/migrations/` |
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
   `user:{id}` room. **The React SPA does not consume this today** —
   `socket.io-client` isn't even a frontend dependency, confirmed by grep.
   The WebSocket layer is real and working server-side (it's what the
   [second-screen companion](./ROADMAP.md#second-screen-companion--design-in-progress)
   idea is designed around), but no current page listens for it.
4. Instead, Dashboard/Explorer/Manage/MyList all poll `/api/v1/novels`
   every 3 minutes (`refreshInterval` in their `useSWR` calls) to pick up
   progress synced from other devices/tabs without a manual reload. Those
   pages previously had `revalidateOnFocus: false` and no interval at all
   (until 2026-08-07), so newly-read chapters wouldn't appear until a hard
   page refresh; a 60s interval fixed that but, left running on open tabs
   indefinitely, contributed to a Supabase egress warning (2026-08-12) —
   3 minutes is the current compromise. See [ROADMAP.md](./ROADMAP.md) for
   wiring up the real WebSocket push instead of polling, which is the
   actual fix and remains deferred.
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

## The bot is intentionally OFF in production

`bot/src/` is a real, working Puppeteer-based scraper for chapter updates
on NovelArrow/NovelBin. It is **not wired into the deployed server**:

- `src/routes/admin.ts` exports `setBotModule()` as an injection hook, but
  nothing in `src/server.ts` ever calls it — every `/api/v1/admin/bot/*`
  route and `POST /admin/force-refresh-all` therefore returns
  `503 Bot module not loaded` in production.
- The Dockerfile's production stage never copies `dist-bot/`.
- The frontend's Admin page used to show a live "Chapter Update Bot" panel
  with a working-looking status/trigger UI that silently no-op'd; that UI
  has been removed and replaced with a static note.

If you need a one-off chapter refresh, run the bot manually and locally:
`npm run bot` (requires `dist-bot/`, built via `npx tsc -p bot/tsconfig.json`
— there's no wired `build:bot` npm script today). Do not re-enable it in
production without also revisiting rate limiting and the exposed API key
above, since a public, unauthenticated trigger for a scraping cycle was
exactly the CRITICAL bug this repo shipped with (`admin.ts:148`, now fixed
to require `validateApiKey`).

There is one known, pre-existing gap between the bot's URL-parsing and the
userscript's: see the comments on `deriveNovelBaseUrl` in
`bot/src/parseNovelInfo.ts` and `userscript/src/services/ChapterDetector.ts`,
and the parity test in `__tests__/regression/novelBaseUrlDerivation.test.ts`.
Low-impact today since the bot doesn't run in production.

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
