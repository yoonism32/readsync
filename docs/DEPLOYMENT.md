# Deployment

## Production

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
`node_modules`. There's no `bot/` or `dist-bot/` to exclude anymore — the
bot was removed outright, see
[ARCHITECTURE.md](./ARCHITECTURE.md#the-bot-was-removed).

There is no `start:legacy` anymore — the old root-level `server.js` and its
supporting files (`tm-live.js`, `chapter-update-bot-enhanced.js`,
`db-utils.js`) were deleted; `dist/server.js` (compiled from `src/`) is the
only entrypoint.

## Environment variables

From `.env.example`:

| Var | Purpose |
|---|---|
| `ADMIN_USERNAME` | Dashboard login username |
| `ADMIN_PASSWORD_HASH` | bcrypt hash — generate with `node generate-password-hash.js YOUR_PASSWORD` |
| `SESSION_SECRET` | `express-session` signing secret |
| `PORT` | HTTP port (defaults to 3000) |
| `DATABASE_URL` | Postgres connection string (Supabase) |
| `NODE_ENV` | `development` / `production` |
| `ADMIN_USER_ID` | Existing `users.id` to bind dashboard sessions to; required when more than one user exists |
| `API_KEY` | Single-user/userscript key embedded at userscript build time; treat the built bundle as credential-bearing |
| `USERSCRIPT_UPDATE_TOKEN` | Secret path token for the automatic userscript update/download route |
| `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` | Supabase project credentials (Storage access — `BackupService.ts`, `covers.ts`) |
| `SUPABASE_ANON_KEY` | Not read by the current backend; see [DATABASE.md](./DATABASE.md#known-dead-config) |
| `PG_SSL_CA` | Optional PEM CA certificate for remote Postgres TLS verification |
| `PG_POOL_MAX` | Postgres pool size, default `10` (`src/config.ts`) — see the transaction-pooler switch in [ROADMAP.md](./ROADMAP.md#ops--infrastructure) for why this value matters and why it wasn't raised |
| `PG_IDLE_TIMEOUT` | Idle client timeout ms, default `30000` (`src/config.ts`) |
| `PG_CONN_TIMEOUT` | Connection acquisition timeout ms, default `10000` (`src/config.ts`) |
| `ALLOWED_ORIGINS` | Comma-separated CORS allowlist (`src/config.ts`) |
| `ALERT_WEBHOOK_URL` | Optional. Runtime errors are POSTed here as JSON (`src/services/Alerter.ts`). Unset = errors reach stdout only, and startup logs a warning. Deliberately not required by `validateEnvironment()` — losing alerts is bad, refusing to boot because alerting isn't configured is worse. |
| `ALERT_COOLDOWN_MS` | Per-error alert cooldown, default `900000` (15m) |
| `ALERT_MAX_PER_HOUR` | Hourly alert ceiling across all errors, default `20` |

The four vars above are read by `src/config.ts` but **not listed in
`.env.example`** — they all have safe defaults so their absence doesn't
break anything, but a deployer tuning pool size or CORS won't find them
there.

## Local development

```bash
npm run setup   # npm install + npm run dev
npm run dev      # tsx watch src/server.ts
```

Frontend dev server and userscript dev build run separately from their own
directories (`frontend/`, `userscript/`) per their own `package.json`
scripts.

## Deliberate production tradeoffs

- **Rate limiting is in-process** — API traffic, login attempts, restore/backup
  runs and key issuance are bounded per process/IP. A multi-instance deployment
  needs shared limiter state; see [ARCHITECTURE.md](./ARCHITECTURE.md).
- **The chapter-update bot** — removed entirely 2026-09-08, not merely off;
  see [ARCHITECTURE.md](./ARCHITECTURE.md#the-bot-was-removed).
