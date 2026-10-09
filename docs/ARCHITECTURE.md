# Architecture

## Stack

| Layer | Tech | Location |
|---|---|---|
| Backend API | Node.js, Express 5, TypeScript | `src/` → compiled to `dist/` |
| Frontend | React 19, React Router 7, Vite, Tailwind 4, SWR | `frontend/` → served at `/app` |
| Browser client | Userscript (Vite-built IIFE, GM API — Tampermonkey/Violentmonkey) | `userscript/` → `dist-userscript/readsync.user.js` |
| Database | Postgres | migrations in `src/db/migrations/` |
| Realtime | Socket.IO | wired into `src/app.ts` |

The deployed entrypoint is `dist/server.js` (compiled from `src/server.ts`).

## Data flow: reading progress sync

1. The userscript (`userscript/src/main.ts`) runs on supported chapter pages,
   tracks scroll position, and debounce-syncs to the backend.
2. `POST /api/v1/progress` (`src/routes/progress.ts`) runs one DB transaction:
   upserts the device, novel and `user_novel_meta`, applies a max-progress
   policy (rejects same-chapter-lower-percent / behind-chapter / restart-noise
   updates), writes a `progress_snapshots` row, and maintains a
   `reading_sessions` row (30-minute idle timeout closes a session).
3. The route emits `progress:updated` over Socket.IO to the user's room.
   The userscript's "Refresh All Novels" flow emits `chapters:updated` when it
   detects a new chapter. Both routers are built by factories
   (`createProgressRouter(io)` / `createAdminRouter(io)`) and a socket failure
   never fails the HTTP response.
4. The React SPA uses a browser session for HTTP and one Socket.IO connection
   per tab. Progress events patch the SWR cache locally; structural changes
   schedule a coalesced refetch. A 30-minute poll is the fallback.

## Authentication

- **Dashboard** — HttpOnly, SameSite=Strict session cookie backed by a
  Postgres session store. Required for privileged routes and Socket.IO.
- **Userscript** — `Authorization: Bearer <key>` header. Issued keys are
  stored only as SHA-256 hashes. Keys in query strings or bodies are rejected.

## Chapter refresh

Chapter-update checks run in the reader's own browser: "Refresh All Novels"
(`frontend/src/hooks/useRefreshAll.ts`) opens each novel's page in a
background tab so the userscript can read it. There is no server-side scraper.

## Database access

The app connects as the table owner. Row-level security is enabled with no
policies on every application table as defense in depth against the hosted
Postgres REST layer.

## See also

- [API_REFERENCE.md](./API_REFERENCE.md) — endpoint list
- [DATABASE.md](./DATABASE.md) — schema
- [TESTING.md](./TESTING.md) — how to run tests
