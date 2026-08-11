# API Reference

Every route currently mounted in `src/app.ts`, grouped by router file. "Auth"
is the middleware actually applied on that route today — see
[ARCHITECTURE.md](./ARCHITECTURE.md) for what each auth type means.
"Validated" means the route has an `express-validator` chain; where it
doesn't, input is checked ad hoc inside the handler (or not at all).

## auth.ts — login, session, and legacy server-rendered pages

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/api/auth/login` | — | Sets the session cookie on success |
| POST | `/api/auth/logout` | — | Destroys the session |
| GET | `/api/auth/api-key` | `requireAuth` | |
| GET | `/api/auth/status` | — | Used by the SPA to check login state |
| GET | `/api/v1/auth/whoami` | `validateApiKey` | |
| GET | `/login` | `redirectIfAuthenticated` | |
| GET | `/`, `/legacy-dashboard`, `/manage`, `/settings`, `/novels`, `/mylist`, `/novel/:novelId`, `/novels/:novelId`, `/admin`, `/explorer`, `/practice` | `requireAuth` | Server-rendered page routes; the React SPA lives at `/app/*` separately |

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
| POST | `/api/v1/novels/:novelId/reread` | `requireAuthAPI` | Yes |
| DELETE | `/api/v1/novels/:novelId` | `requireAuthAPI` | |
| POST | `/api/v1/novels/:novelId/favorite` | `requireAuthAPI` | |
| DELETE | `/api/v1/novels/:novelId/favorite` | `requireAuthAPI` | |
| GET | `/api/v1/novels/completed` | `validateApiKey` | |
| GET | `/api/v1/novels/favorites` | `validateApiKey` | |
| PUT | `/api/v1/novels/:novelId/notes` | `validateApiKey` | |
| POST | `/api/v1/novels/bulk-status` | `validateApiKey` | |
| GET | `/api/v1/export` | `validateApiKey` | |
| POST | `/api/v1/import` | `validateApiKey` | |

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
| GET | `/api/v1/admin/novels/stale` | `validateApiKey` | Works independently of the bot |
| POST | `/api/v1/admin/novels/:novelId/update` | `validateApiKey` | Bot route — `503` in production, see [ARCHITECTURE.md](./ARCHITECTURE.md#the-bot-is-intentionally-off-in-production) |
| GET | `/api/v1/admin/bot/status` | `validateApiKey` | Bot route — `503` in production |
| POST | `/api/v1/admin/bot/trigger` | `validateApiKey` | Bot route — `503` in production |
| POST | `/api/v1/admin/novels/single-run` | `validateApiKey` | Bot route — `503` in production |
| POST | `/admin/force-refresh-all` | `validateApiKey` | **Was unauthenticated** — fixed; see `__tests__/regression/adminAuth.test.ts` |
| GET | `/api/v1/admin/bot/progress` | `validateApiKey` | DB portion works; bot-status portion is a stub in production |
| POST | `/api/v1/admin/novels/auto-update` | `validateApiKey` | Called by the userscript's "Update All" flow, not the bot |

## userscript.ts (factory: `createUserscriptRouter(path?)`)

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/readsync.user.js` | — | Serves `dist-userscript/readsync.user.js`; `Cache-Control: no-cache` and no auth so GM-API managers (Tampermonkey, Violentmonkey) can poll `@updateURL`/`@downloadURL` outside any session; `404` if the userscript hasn't been built |
