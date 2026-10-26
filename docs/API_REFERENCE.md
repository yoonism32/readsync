# API Reference

Every route currently mounted in `src/app.ts`, grouped by router file. "Auth"
is the middleware actually applied on that route today — see
[ARCHITECTURE.md](./ARCHITECTURE.md) for what each auth type means.
"Validated" means the route has an `express-validator` chain; where it
doesn't, input is checked ad hoc inside the handler (or not at all).

Authentication update (2026-09-11): all `/api/v1/*` requests first authenticate
a bound dashboard session or `Authorization: Bearer <key>`. `validateApiKey`
now accepts either, and `requireAuthAPI` additionally requires a dashboard session.
Keys in query strings or request bodies are rejected. Socket.IO uses the session.
The optional key-issuance endpoint returns a replacement once; only its hash is
stored, and replacing an issued key revokes it. The current userscript build uses
the owner-configured `API_KEY` environment value instead, and the SPA has no key
configuration card.

`src/app.ts` applies `validateApiKey` to the whole `/api/v1` prefix before any
router runs. The Auth column below shows each route's *own* chain on top of
that global check. Unless noted otherwise, JSON bodies are limited to 10 MB
(`JSON_BODY_LIMIT` in `src/config.ts`). Every `/api` response is sent with
`Cache-Control: no-store`. All `/api/*` traffic is rate-limited to 600
requests per minute. Import, backup run and key issuance are limited to 5 per
minute (see [ARCHITECTURE.md](./ARCHITECTURE.md#rate-limiting)).

`GET /api/v1/export` returns version 2 with `novels`, `meta`, `devices`, `progress`,
`bookmarks`, `notes`, `categories`, `sessions`, `settings` and `notifications`.
`POST /api/v1/import` accepts `{ "data": <export> }` under a dashboard session,
with a 20 MiB body limit and 500,000-record limit per collection. Restore merges
metadata/settings and inserts missing records atomically; unrelated records remain.
Legacy exports remain readable but cannot recover history their exporter omitted.

Internal daily backups use version 2 with `scope: "library-backup"`. They retain
library metadata, bookmarks, notes, categories, preferences and devices, plus the
latest and furthest position per novel/device in the current read-through after
any progress reset. Sessions and notifications are empty; detailed snapshot history
and internal backup/refresh timestamps are excluded. The last 30 backups are kept.
These compact files use the same import endpoint; the full-data export is unchanged.

## app.ts — mounted directly

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/health` | — | `200 {status:"ok"}` or `503 {status:"degraded"}`, plus `timestamp`, `uptime` and `checks.database` |
| GET | `/app/*splat` | — | Serves the SPA's `index.html`. Hashed `/app/assets/*` are cached immutably for one year |
| GET | `/practice.html` | `requireAuth` | Retired legacy API explorer; returns 410 |

## auth.ts — login, session, and legacy page redirects

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/api/auth/login` | — | Checks `ADMIN_USERNAME` + bcrypt `ADMIN_PASSWORD_HASH` and sets the session cookie on success. 5 attempts per IP per 15 min (`X-RateLimit-*` headers; `429` with `Retry-After`) |
| POST | `/api/auth/logout` | — | Destroys the session |
| POST | `/api/auth/api-key` | `requireAuthAPI` | Issues a replacement key, returned once as `{api_key}` with `no-store` |
| GET | `/api/auth/status` | — | Used by the SPA to check login state |
| GET | `/api/v1/auth/whoami` | `validateApiKey` | Returns `{id, display_name, authenticated: true}` |
| GET | `/` | — | Redirects to `/app/` (the SPA) |
| GET | `/login`, `/legacy/dashboard`, `/legacy-dashboard`, `/legacy/manage`, `/manage`, `/legacy/settings`, `/settings`, `/legacy/mylist`, `/mylist`, `/novels`, `/legacy/novel/:novelId`, `/novel/:novelId`, `/novels/:novelId`, `/legacy/admin`, `/admin`, `/legacy/explorer`, `/explorer` | — | Legacy pages sunset 2026-09-08: 301 redirect straight to their `/app/*` SPA equivalent (`/login` → `/app/login`, etc). No HTML served here anymore. |
| GET | `/legacy/practice` | `requireAuth` | Retired legacy API explorer; returns 410 (`/practice.html` is in app.ts) |
| GET | `/practice` | — | 301 redirect to `/legacy/practice` |

## progress.ts — the sync path (factory: `createProgressRouter(io)`)

| Method | Path | Auth | Validated |
|---|---|---|---|
| POST | `/api/v1/progress` | `validateApiKey` (after the validator chain) | Yes |
| GET | `/api/v1/progress` | `validateApiKey` | |
| GET | `/api/v1/compare` | `validateApiKey` | |
| GET | `/api/v1/debug/last` | `validateApiKey` | |

## novels.ts

| Method | Path | Auth | Validated |
|---|---|---|---|
| GET | `/api/v1/novels` | `requireAuthAPI` + `validateApiKey` | Pagination |
| GET | `/api/v1/novels/:novelId/chapters-read` | `validateApiKey` | |
| PUT | `/api/v1/novels/:novelId/status` | `requireAuthAPI` + `validateApiKey` | Yes |
| POST | `/api/v1/novels/:novelId/progress-override` | `requireAuthAPI` + `validateApiKey` | Yes (`chapter_num`, `percent`) |
| POST | `/api/v1/novels/:novelId/reread` | `validateApiKey` | Yes |
| GET | `/api/v1/novels/:novelId/synopsis` | `requireAuthAPI` + `validateApiKey` | Novel ID |
| DELETE | `/api/v1/novels/:novelId` | `requireAuthAPI` + `validateApiKey` | |
| POST | `/api/v1/novels/:novelId/favorite` | `requireAuthAPI` + `validateApiKey` | |
| DELETE | `/api/v1/novels/:novelId/favorite` | `requireAuthAPI` + `validateApiKey` | |
| GET | `/api/v1/novels/completed` | `validateApiKey` | |
| GET | `/api/v1/novels/favorites` | `validateApiKey` | |
| PUT | `/api/v1/novels/:novelId/notes` | `validateApiKey` | |
| PUT | `/api/v1/novels/:novelId/rating` | `validateApiKey` | Yes. `rating` 0–5, snapped to the nearest 0.5; `0` clears it (stored as NULL) |
| POST | `/api/v1/novels/bulk-status` | `requireAuthAPI` + `validateApiKey` | Yes; up to 200 novels |
| GET | `/api/v1/export` | `validateApiKey` | |
| POST | `/api/v1/import` | `requireAuthAPI` (applied in app.ts before the 20 MB body parser) + `validateApiKey` | Versioned export validation |

## bookmarks.ts

| Method | Path | Auth | Validated |
|---|---|---|---|
| GET | `/api/v1/bookmarks/:novelId` | `validateApiKey` | |
| GET | `/api/v1/bookmarks` | `validateApiKey` | |
| POST | `/api/v1/bookmarks` | `validateApiKey` (after the validator chain) | Yes |
| PUT | `/api/v1/bookmarks/:bookmarkId` | `validateApiKey` | |
| DELETE | `/api/v1/bookmarks/:bookmarkId` | `validateApiKey` | |

## notes.ts

| Method | Path | Auth | Validated |
|---|---|---|---|
| GET | `/api/v1/novels/:novelId/notes` | `validateApiKey` | |
| POST | `/api/v1/novels/:novelId/notes` | `validateApiKey` | Yes |
| PUT | `/api/v1/notes/:noteId` | `validateApiKey` | Yes |
| DELETE | `/api/v1/notes/:noteId` | `validateApiKey` | Yes |

## notifications.ts

| Method | Path | Auth | Validated |
|---|---|---|---|
| GET | `/api/v1/notifications` | `validateApiKey` | Returns at most 50 |
| GET | `/api/v1/notifications/unread-count` | `validateApiKey` | |
| POST | `/api/v1/notifications/:id/read` | `validateApiKey` | Yes |
| POST | `/api/v1/notifications/read-all` | `validateApiKey` | |

## categories.ts

| Method | Path | Auth | Validated |
|---|---|---|---|
| GET | `/api/v1/categories` | `validateApiKey` | |
| POST | `/api/v1/novels/:novelId/categories` | `validateApiKey` | Yes |
| DELETE | `/api/v1/novels/:novelId/categories/:category` | `validateApiKey` | Yes |

## history.ts

| Method | Path | Auth | Validated |
|---|---|---|---|
| GET | `/api/v1/history` | `validateApiKey` | Yes |

## devices.ts

| Method | Path | Auth |
|---|---|---|
| GET | `/api/v1/devices` | `validateApiKey` |
| PUT | `/api/v1/devices/:deviceId` | `validateApiKey` |
| DELETE | `/api/v1/devices/:deviceId` | `validateApiKey` |

## sessions.ts

| Method | Path | Auth |
|---|---|---|
| GET | `/api/v1/sessions` | `validateApiKey` |
| GET | `/api/v1/sessions/active` | `validateApiKey` |
| GET | `/api/v1/sessions/:novelId` | `validateApiKey` |
| POST | `/api/v1/sessions` | `validateApiKey` |
| PUT | `/api/v1/sessions/:sessionId/end` | `validateApiKey` |

## backups.ts

| Method | Path | Auth |
|---|---|---|
| GET | `/api/v1/backups` | `validateApiKey` |
| POST | `/api/v1/backups/run` | `validateApiKey` |

## stats.ts

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/v1/stats/replay` | `validateApiKey` | Monthly Reading Replay |
| GET | `/api/v1/stats/summary` | `validateApiKey` | |
| GET | `/api/v1/stats/library` | `validateApiKey` | |
| GET | `/api/v1/stats/daily` | `validateApiKey` | |
| GET | `/api/v1/stats/genres` | `validateApiKey` | Genre breakdown share — `frontend/src/pages/Stats.tsx` |
| GET | `/api/v1/stats/velocity` | `validateApiKey` | 14-day chapters-read trend, split into trailing 7-day windows — `computeVelocityTrend()` in `src/services/StatsVelocity.ts` |
| GET | `/api/v1/stats/breakdown` | `validateApiKey` | Reading time by hour-of-day, weekday, and device — `frontend/src/pages/Stats.tsx` |
| GET | `/api/v1/stats/pace` | `validateApiKey` | |
| GET | `/api/v1/stats/rating-audit` | `validateApiKey` | |
| GET | `/api/v1/stats/on-this-day` | `validateApiKey` | |
| GET | `/api/v1/stats/novels/:novelId` | `validateApiKey` | |

## settings.ts

| Method | Path | Auth |
|---|---|---|
| GET | `/api/v1/settings/last-refresh` | `requireAuthAPI` + `validateApiKey` |
| POST | `/api/v1/settings/last-refresh` | `requireAuthAPI` + `validateApiKey` |
| GET | `/api/v1/settings/prefs` | `requireAuthAPI` + `validateApiKey` |
| PUT | `/api/v1/settings/prefs` | `requireAuthAPI` + `validateApiKey` |

## covers.ts

| Method | Path | Auth |
|---|---|---|
| GET | `/api/v1/covers/:novelId` | `validateApiKey` |
| POST | `/api/v1/covers/:novelId/upload` | `validateApiKey` (10 MB JSON limit applies) |

## admin.ts

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/v1/admin/novels/stale` | `requireAuthAPI` (dashboard session) | Read-only report, unrelated to the bot |
| POST | `/api/v1/admin/novels/auto-update` | `validateApiKey` | Called by the userscript's "Update All" flow, not the bot |

Every bot-gated route (`/api/v1/admin/novels/:novelId/update`, `/bot/status`,
`/bot/trigger`, `/novels/single-run`, `/bot/progress`, `/admin/force-refresh-all`)
was removed 2026-09-08 along with `bot/` itself — see
[ARCHITECTURE.md](./ARCHITECTURE.md#the-bot-was-removed). They always `503`'d
in production anyway (`setBotModule()` had no caller), so nothing changes
behaviorally; the dead plumbing is just gone now.

## userscript.ts (default export: `createUserscriptRouter()`; the path argument exists for tests)

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/u/:token/readsync.user.js` | Path token (`USERSCRIPT_UPDATE_TOKEN`) | Serves `dist-userscript/readsync.user.js`; `Cache-Control: no-cache` so GM-API managers (Tampermonkey, Violentmonkey) can poll `@updateURL`/`@downloadURL` outside any session. No session auth is possible here, so the path itself carries a secret token (compared timing-safely on SHA-256 hashes) that keeps the URL from being guessable. `404 Not found` on a wrong or missing token; `404 Userscript build not found` if the userscript hasn't been built. See [USERSCRIPT.md](./USERSCRIPT.md) |

## Personal status report

`GET /api/v1/status` returns an on-demand JSON overview of the authenticated
account. Use an existing signed-in browser session or an `Authorization: Bearer`
API key header. Anonymous requests receive HTTP 401. Responses use
`Cache-Control: private, no-store` (overriding the `/api` default). No public report page is added.

| Field | Contents |
| --- | --- |
| `generated_at` | UTC time at which the report was assembled |
| `report_status` | `complete`, or `partial` when backup storage cannot be checked |
| `service` | Database query success and server uptime in seconds |
| `library` | Account's non-removed novels, counts by reading status, known unread chapters |
| `reading` | Up to eight recently read novels with IDs, titles, current read-through, bookmark chapter/percent, last-read date, and unread counts; last recorded reader sync, active device count, and completed-session duration |
| `refresh` | Last recorded refresh, reminder interval, next due time, and latest library metadata update |
| `storage` | Account's saved snapshot/session/bookmark/note counts and listed backup files' byte size |
| `backups` | Storage availability, last recorded success/attempt, and next backup eligibility time |

The recent-reading positions follow the dashboard's current read-through and
progress-reset cutoff. Manual bookmark corrections do not create reading
activity; an explicit last-read override is respected. Removed novels are
excluded from the library/recent-reading sections, but their retained records
still count toward saved data. Null positions and unread counts mean unknown.

Refresh due times are **reminders**, not automatic jobs (`automatic: false`).
The last refresh timestamp does not prove that every novel refreshed
successfully; per-novel refresh outcomes currently live only in the browser.
Backup eligibility is not an exact run time: the existing scheduler checks every
six hours while the server runs. With no prior attempt, a configured backup is
eligible at the next scheduler check. `last_attempt_at` is the last *recorded*
attempt, not an audit of every network failure.

`backup_bytes` covers backup files only, not PostgreSQL disk usage or cover images.
It is null when storage is unavailable or unconfigured, and zero for a reachable
empty backup inventory. The inventory is bounded to 100 files;
`backup_inventory_truncated: true` means the count/bytes may be partial.

This report does not replace `/health` for frequent Kuma checks: it queries
personal records and backup storage. A partial report still returns HTTP 200;
clients can inspect `report_status` and `backups.storage_status`. A database
query failure returns HTTP 500 using the existing API error handler.

## WebSocket (Socket.IO)

The connection authenticates with the dashboard session cookie, not an API
key. Sockets are origin-checked against `ALLOWED_ORIGINS`.

- Each socket joins `user:{id}` and `session:{sessionID}`. Logging out
  disconnects every socket in that session's room.
- The session is rechecked every 60 seconds (`src/websocket/handlers.ts`).
  Sockets whose session has ended are dropped.

Server → client events, both sent to the `user:{id}` room:

| Event | Sent by | Payload |
|---|---|---|
| `progress:updated` | `POST /api/v1/progress` (`src/routes/progress.ts`) | `{novel_id, ...policy result, timestamp}` |
| `chapters:updated` | `POST /api/v1/admin/novels/auto-update` (`src/routes/admin.ts`) | `{novel_id, title, previous_chapter, latest_chapter, timestamp}` |

The SPA patches its SWR cache from these events. It also refetches on
reconnect, and polls every 30 minutes as a fallback.
