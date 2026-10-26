# Architecture

Current state of the system, last checked against the source on 2026-10-26. This document exists because
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
| Database | Postgres (Supabase-hosted) | 20 migrations in `src/db/migrations/` |
| Realtime | Socket.IO | wired into `src/app.ts` |

The only deployed entrypoint is `dist/server.js` (compiled from
`src/server.ts`) — confirmed by `render.yaml` (`startCommand: node
dist/server.js`) and the Dockerfile's production stage, which copies
`dist/`, `public/`, `dist-userscript/`, `package.json` and pruned
`node_modules`.

Startup order (`src/server.ts`):

1. `validateEnvironment()`, which exits if `DATABASE_URL` or `SESSION_SECRET`
   is missing.
2. `runMigrations()`.
3. Listen on `PORT`.
4. Start the backup scheduler.

Unhandled rejections and uncaught exceptions are logged and sent to the
optional alert webhook (`src/services/Alerter.ts`). Uncaught exceptions also
exit the process, so Render restarts it.

## Data flow: reading progress sync

1. The userscript (`userscript/src/main.ts`) runs on `novelping.com` (current)
   and the legacy `novelarrow.com` and `novelbin.{com,me,net,org}` novel and
   chapter pages. It tracks scroll position and debounce-syncs to the
   backend. See [USERSCRIPT.md](./USERSCRIPT.md).
2. `POST /api/v1/progress` (`src/routes/progress.ts`), authenticated by
   `validateApiKey` (a bound dashboard session, the `API_KEY` environment
   key, or a SHA-256-hashed issued key in `users.api_key`, checked in that
   order), runs one DB transaction: upserts the device, upserts
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
4. The React SPA uses a browser session for HTTP and one Socket.IO connection
   per authenticated tab. Normal progress events patch the SWR library cache
   locally. New novels, read-through changes, chapter metadata updates and
   reconnections schedule a coalesced refetch. The 30-minute polling interval
   remains a fallback. Large libraries fetch subsequent 200-row pages.

## Authentication

| | Dashboard session | Userscript key |
|---|---|---|
| Use | SPA/API access, privileged routes and Socket.IO | Userscript-compatible API routes |
| Transport | HttpOnly, SameSite=Strict cookie, Secure in production | Authorization: Bearer header |
| Storage | Postgres session store, with explicit users.id binding | Optional issued keys are stored only as SHA-256 hashes |
| Lifecycle | Regenerate and save on login; destroy on logout | Rebuild after rotating `API_KEY`; the optional API endpoint revokes a prior issued key |

Login checks `ADMIN_USERNAME` and verifies the shared admin password against
the bcrypt `ADMIN_PASSWORD_HASH`. ADMIN_USER_ID
selects the associated user; if unset, the database must contain exactly one user.
All /api/v1 requests authenticate before parsing bodies. Routes with requireAuthAPI
additionally require a dashboard session. Query/body credentials are rejected.
Socket handshakes verify browser origin/fetch metadata and session binding;
active sessions are rechecked every 60 seconds and logout disconnects their sockets.

Sessions live in Postgres via `connect-pg-simple`:

- Table `session` (migration 009), with expired rows pruned every 15
  minutes.
- The cookie `maxAge` is 30 days (`SESSION_MAX_AGE_MS`). The unrelated
  30-minute `SESSION_IDLE_SECONDS` closes *reading* sessions.
- In production, `trust proxy` is 1, so the Secure cookie works behind
  Render's proxy.

Migration 015 revokes old published keys and pre-binding sessions. Deploy the
server, SPA, userscript 5.8.1 or later (currently 5.9.1) and migrations
015–018 together, then verify the
environment key and dashboard session binding.
See [the release checklist](./SECURITY-REMEDIATION-2026-09-11.md).

## Security headers

Set by hand in `src/app.ts`; helmet isn't used.

- `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer` and
  `X-Frame-Options: DENY`.
- HSTS (`max-age=31536000`) in production.
- `x-powered-by` is disabled.
- CSP: `default-src 'self'; script-src 'self'; style-src 'self'
  'unsafe-inline'; img-src 'self' https: data:; connect-src 'self' wss:;
  font-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action
  'self'`.

CORS allows `ALLOWED_ORIGINS` and the reader hosts (`READER_HOSTS` in
`src/services/ReaderUrl.ts`, with and without `www.`), with credentials.

## Rate limiting

All `/api/*` traffic, including `/api/auth`, is limited to 600 requests per
minute per IP (`express-rate-limit`, `src/app.ts`). `/api/v1/import`,
`/api/v1/backups/run` and `/api/auth/api-key` are also limited to 5 per
minute. Login has its own limiter, 5 attempts per IP per 15 minutes
(`src/middleware/rateLimiter.ts`). Each attempt is reserved before the bcrypt
check runs. These limits suit the current
single-process deployment. A multi-instance deployment needs shared limiter state.

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
- Userscript install, update and build: [USERSCRIPT.md](./USERSCRIPT.md)
- Security policy and reporting: [SECURITY.md](../SECURITY.md)
- What's tested and how to run it: [TESTING.md](./TESTING.md)
- Open backlog: [ROADMAP.md](./ROADMAP.md)
