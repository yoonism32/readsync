# API Reference

Every route currently mounted in `src/app.ts`, grouped by router file. "Auth"
is the middleware actually applied on that route today — see
[ARCHITECTURE.md](./ARCHITECTURE.md) for what each auth type means.
"Validated" means the route has an `express-validator` chain; where it
doesn't, input is checked ad hoc inside the handler (or not at all).

Requests to `/api/v1/*` authenticate with a dashboard session or an
`Authorization: Bearer <key>` header; `requireAuthAPI` routes require a session.

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

## auth.ts — login, session, and legacy page redirects

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/api/auth/login` | — | Sets the session cookie on success |
| POST | `/api/auth/logout` | — | Destroys the session |
| POST | `/api/auth/api-key` | `requireAuthAPI` | Issues a replacement key, returned once |
| GET | `/api/auth/status` | — | Used by the SPA to check login state |
| GET | `/api/v1/auth/whoami` | `validateApiKey` | |
| GET | `/` | — | Redirects to `/app/` (the SPA) |
| GET | `/login`, `/legacy/dashboard`, `/legacy-dashboard`, `/legacy/manage`, `/manage`, `/legacy/settings`, `/settings`, `/legacy/mylist`, `/mylist`, `/novels`, `/legacy/novel/:novelId`, `/novel/:novelId`, `/novels/:novelId`, `/legacy/admin`, `/admin`, `/legacy/explorer`, `/explorer` | — | 301 redirect straight to their `/app/*` SPA equivalent (`/login` → `/app/login`, etc). No HTML served here anymore. |
| GET | `/legacy/practice`, `/practice.html` | `requireAuth` | Retired legacy API explorer; returns 410 |
| GET | `/practice` | — | 301 redirect to `/legacy/practice` |

## progress.ts — the sync path (factory: `createProgressRouter(io)`)

| Method | Path | Auth | Validated |
|---|---|---|---|
| POST | `/api/v1/progress` | `validateApiKey` (inside the chain) | Yes |
| GET | `/api/v1/progress` | `validateApiKey` | |
| GET | `/api/v1/compare` | `validateApiKey` | |
| GET | `/api/v1/debug/last` | `validateApiKey` | |

## novels.ts

| Method | Path | Auth | Validated |
|---|---|---|---|
| GET | `/api/v1/novels` | `requireAuthAPI` | |
| GET | `/api/v1/novels/:novelId/chapters-read` | `validateApiKey` | |
| PUT | `/api/v1/novels/:novelId/status` | `requireAuthAPI` | |
| POST | `/api/v1/novels/:novelId/progress-override` | `requireAuthAPI` | |
| POST | `/api/v1/novels/:novelId/reread` | `validateApiKey` | Yes |
| DELETE | `/api/v1/novels/:novelId` | `requireAuthAPI` | |
| POST | `/api/v1/novels/:novelId/favorite` | `requireAuthAPI` | |
| DELETE | `/api/v1/novels/:novelId/favorite` | `requireAuthAPI` | |
| GET | `/api/v1/novels/completed` | `validateApiKey` | |
| GET | `/api/v1/novels/favorites` | `validateApiKey` | |
| PUT | `/api/v1/novels/:novelId/notes` | `validateApiKey` | |
| POST | `/api/v1/novels/bulk-status` | `requireAuthAPI` | Yes; up to 200 novels |
| GET | `/api/v1/export` | `validateApiKey` | |
| POST | `/api/v1/import` | `requireAuthAPI` | Versioned export validation |

## bookmarks.ts

| Method | Path | Auth | Validated |
|---|---|---|---|
| GET | `/api/v1/bookmarks/:novelId` | `validateApiKey` | |
| GET | `/api/v1/bookmarks` | `validateApiKey` | |
| POST | `/api/v1/bookmarks` | `validateApiKey` (inside the chain) | Yes |
| PUT | `/api/v1/bookmarks/:bookmarkId` | `validateApiKey` | |
| DELETE | `/api/v1/bookmarks/:bookmarkId` | `validateApiKey` | |

## notes.ts

| Method | Path | Auth | Validated |
|---|---|---|---|
| GET | `/api/v1/novels/:novelId/notes` | `validateApiKey` | |
| POST | `/api/v1/novels/:novelId/notes` | `validateApiKey` | Yes |
| PUT | `/api/v1/notes/:noteId` | `validateApiKey` | |
| DELETE | `/api/v1/notes/:noteId` | `validateApiKey` | |

## notifications.ts

| Method | Path | Auth |
|---|---|---|
| GET | `/api/v1/notifications` | `validateApiKey` |
| POST | `/api/v1/notifications/:id/read` | `validateApiKey` |
| POST | `/api/v1/notifications/read-all` | `validateApiKey` |

## categories.ts

| Method | Path | Auth |
|---|---|---|
| GET | `/api/v1/categories` | `validateApiKey` |
| POST | `/api/v1/novels/:novelId/categories` | `validateApiKey` |
| DELETE | `/api/v1/novels/:novelId/categories/:category` | `validateApiKey` |

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
| GET | `/api/v1/stats/summary` | `validateApiKey` | |
| GET | `/api/v1/stats/library` | `validateApiKey` | |
| GET | `/api/v1/stats/daily` | `validateApiKey` | |
| GET | `/api/v1/stats/genres` | `validateApiKey` | Genre breakdown share — `frontend/src/pages/Stats.tsx` |
| GET | `/api/v1/stats/velocity` | `validateApiKey` | 14-day chapters-read trend, split into trailing 7-day windows — `computeVelocityTrend()` in `src/services/StatsVelocity.ts` |
| GET | `/api/v1/stats/breakdown` | `validateApiKey` | Reading time by hour-of-day, weekday, and device — `frontend/src/pages/Stats.tsx` |
| GET | `/api/v1/stats/novels/:novelId` | `validateApiKey` | |

## settings.ts

| Method | Path | Auth |
|---|---|---|
| GET | `/api/v1/settings/last-refresh` | `requireAuthAPI` |
| POST | `/api/v1/settings/last-refresh` | `requireAuthAPI` |
| GET | `/api/v1/settings/prefs` | `requireAuthAPI` + `validateApiKey` |
| PUT | `/api/v1/settings/prefs` | `requireAuthAPI` + `validateApiKey` |

## covers.ts

| Method | Path | Auth |
|---|---|---|
| GET | `/api/v1/covers/:novelId` | `validateApiKey` |
| POST | `/api/v1/covers/:novelId/upload` | `validateApiKey` |

## admin.ts

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/v1/admin/novels/stale` | `validateApiKey` | Read-only report |
| POST | `/api/v1/admin/novels/auto-update` | `validateApiKey` | Called by the userscript's "Update All" flow |

## userscript.ts (factory: `createUserscriptRouter(path?)`)

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/u/:token/readsync.user.js` | Secret path token | Serves the built userscript for GM-manager auto-update; `404` on a wrong token |

## Personal status report

`GET /api/v1/status` returns an on-demand JSON overview of the authenticated
account. Use an existing signed-in browser session or an `Authorization: Bearer`
API key header. Anonymous requests receive HTTP 401. Responses use
`Cache-Control: private, no-store`. No public report page is added.

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
