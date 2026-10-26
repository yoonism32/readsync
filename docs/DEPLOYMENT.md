# Deployment

## Production

Node: `engines` requires `>=22.12.0`. `render.yaml` (`NODE_VERSION`), the
Dockerfile and `.nvmrc` all pin `22.23.4`. CI uses the latest `22.x`.

Hosted on Render, configured via `render.yaml`:

```yaml
buildCommand: npm install && npm run build:all
startCommand: node dist/server.js
healthCheckPath: /health
```

`npm run build:all` does, in order: compile `src/` with `tsc`, copy SQL
migrations into `dist/db/migrations/`, install and build `frontend/`
(output lands in `public/app/`), then install and build `userscript/`
(output lands in `dist-userscript/readsync.user.js`). `GET
/u/:token/readsync.user.js` serves that file directly (see
`src/routes/userscript.ts`) once `:token` matches `USERSCRIPT_UPDATE_TOKEN`
(everything else 404s), and the built header carries `@updateURL`/`@downloadURL`
pointing at that same gated route, so GM-API managers (Tampermonkey,
Violentmonkey) self-update once the userscript version
(`userscript/package.json`) is bumped and redeployed. The build embeds a live
API key in the served file, so the token exists to keep that URL from being
guessable — set `USERSCRIPT_UPDATE_TOKEN` in the build environment alongside
`API_KEY` before running `npm run build:all`.

`Dockerfile` mirrors this for container deploys: the production stage
copies `dist/`, `public/`, `dist-userscript/`, `package.json`, and pruned
`node_modules`. **Docker builds need the userscript secrets too.** The build
stage runs `npm run build:all`, which builds the userscript. `.dockerignore`
keeps `.env` out of the build context, and the Dockerfile declares no build
args for `API_KEY` or `USERSCRIPT_UPDATE_TOKEN`. As written, a container build
has no way to receive them, and the userscript step fails. Render isn't
affected, because it builds with its own environment variables. There's no `bot/` or `dist-bot/` to exclude anymore — the
bot was removed outright, see
[ARCHITECTURE.md](./ARCHITECTURE.md#the-bot-was-removed).

There is no `start:legacy` anymore — the old root-level `server.js` and its
supporting files (`tm-live.js`, `chapter-update-bot-enhanced.js`,
`db-utils.js`) were deleted; `dist/server.js` (compiled from `src/`) is the
only entrypoint.

## Environment variables

Everything below except `SUPABASE_ANON_KEY` is listed in `.env.example`.
Only `DATABASE_URL` and `SESSION_SECRET` are hard requirements; the server
exits without them. `render.yaml` declares only `NODE_VERSION`. Every other
variable is set by hand in the Render dashboard.

| Var | Purpose |
|---|---|
| `ADMIN_USERNAME` | Dashboard login username, default `admin` |
| `ADMIN_PASSWORD_HASH` | bcrypt hash — generate with `node generate-password-hash.js YOUR_PASSWORD` (see [SECURITY.md](../SECURITY.md#notes-for-operators) about shell history). Unset = dashboard login disabled, with a startup warning |
| `SESSION_SECRET` | `express-session` signing secret |
| `PORT` | HTTP port (defaults to 3000) |
| `DATABASE_URL` | Postgres connection string (Supabase) |
| `NODE_ENV` | `development` / `production` |
| `ADMIN_USER_ID` | Existing `users.id` to bind dashboard sessions to; required when more than one user exists |
| `API_KEY` | Single-user/userscript API key; keep private. **Required at build time** (embedded in the userscript) |
| `USERSCRIPT_UPDATE_TOKEN` | Secret path token for the automatic userscript update/download route. **Required at build time** |
| `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` | Supabase project credentials (Storage access — `BackupService.ts`, `covers.ts`) |
| `SUPABASE_ANON_KEY` | Not read by the current backend; see [DATABASE.md](./DATABASE.md#credentials-and-config-notes) |
| `PG_SSL_CA` | Optional PEM CA certificate for remote Postgres TLS verification |
| `PG_POOL_MAX` | Postgres pool size, default `15` (`src/config.ts`). It was raised from 10 after the 2026-09-12 OOM crash loop, once the transaction-pooler switch gave headroom; see [ROADMAP.md](./ROADMAP.md#ops--infrastructure) |
| `PG_IDLE_TIMEOUT` | Idle client timeout ms, default `30000` (`src/config.ts`) |
| `PG_CONN_TIMEOUT` | Connection acquisition timeout ms, default `10000` (`src/config.ts`) |
| `ALLOWED_ORIGINS` | Comma-separated CORS and Socket.IO origin allowlist (`src/config.ts`). The default is the production Render origin plus `http://localhost:3000`, and also `:5173` outside production. Reader hosts are always allowed for CORS |
| `ALERT_WEBHOOK_URL` | Optional. Runtime errors are POSTed here as JSON (`src/services/Alerter.ts`). Unset = errors reach stdout only, and startup logs a warning. Deliberately not required by `validateEnvironment()` — losing alerts is bad, refusing to boot because alerting isn't configured is worse. |
| `ALERT_COOLDOWN_MS` | Per-error alert cooldown, default `900000` (15m) |
| `ALERT_MAX_PER_HOUR` | Hourly alert ceiling across all errors, default `20` |

Not read by the server, but used elsewhere:

| Var | Used by |
|---|---|
| `READSYNC_TEST_DATABASE_URL` | Enables the integration tests. Must be a localhost `readsync_audit` database (`__tests__/setup.ts`). See [TESTING.md](./TESTING.md) |
| `DUMP_URL` | The manual `pg_dump` workflow in [BACKUPS.md](./BACKUPS.md) |

## Local development

```bash
npm run setup   # npm install + npm run dev
npm run dev      # tsx watch src/server.ts
```

- **Frontend:** `npm run dev --prefix frontend` starts Vite on `:5173`. It
  proxies `/api`, `/u`, `/health` and `/socket.io` to `:3000`.
- **Userscript:** `npm run dev --prefix userscript` rebuilds on change
  (`vite build --watch`). See [USERSCRIPT.md](./USERSCRIPT.md).
- **Docker:** `docker compose up` runs the app's `dev` stage against
  `postgres:16-alpine` on `127.0.0.1:5432`. The compose file sets
  `DATABASE_URL`, `NODE_ENV` and a dev `SESSION_SECRET`, but no
  `ADMIN_PASSWORD_HASH`, so login is off until you add one.
- **Before pushing:** `npm run verify` runs everything CI runs (see
  [TESTING.md](./TESTING.md)).

Common startup and login problems: [TROUBLESHOOTING.md](./TROUBLESHOOTING.md).

## Deliberate production tradeoffs

- **Rate limiting is in-process** — API traffic, login attempts, restore/backup
  runs and key issuance are bounded per process/IP. A multi-instance deployment
  needs shared limiter state; see [ARCHITECTURE.md](./ARCHITECTURE.md).
- **The chapter-update bot** — removed entirely 2026-09-08, not merely off;
  see [ARCHITECTURE.md](./ARCHITECTURE.md#the-bot-was-removed).
