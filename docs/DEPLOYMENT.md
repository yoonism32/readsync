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
(output lands in `dist-userscript/readsync.user.js`). `GET /readsync.user.js`
serves that file directly (see `src/routes/userscript.ts`), and the built
header carries `@updateURL`/`@downloadURL` pointing at that same route, so
GM-API managers (Tampermonkey, Violentmonkey) self-update once the userscript
version (`userscript/package.json`) is bumped and redeployed.

`Dockerfile` mirrors this for container deploys: the production stage
copies `dist/`, `public/`, `dist-userscript/`, `package.json`, and pruned
`node_modules`. Nothing under `bot/` or `dist-bot/` is included — see
[ARCHITECTURE.md](./ARCHITECTURE.md#the-bot-is-intentionally-off-in-production).

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
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_KEY` | Supabase project credentials |
| `BOT_DISABLED`, `API_KEY` | **Not read anywhere in current code** — see [DATABASE.md](./DATABASE.md#known-dead-config) |

## Local development

```bash
npm run setup   # npm install + npm run dev
npm run dev      # tsx watch src/server.ts
```

Frontend dev server and userscript dev build run separately from their own
directories (`frontend/`, `userscript/`) per their own `package.json`
scripts.

## Deliberate production tradeoffs

Both of these are intentional, not oversights — see
[ARCHITECTURE.md](./ARCHITECTURE.md) for the reasoning:

- **Rate limiting is off** (`express-rate-limit` installed, not applied).
- **The chapter-update bot is off** (never wired into `src/server.ts`, not
  shipped in the Docker image).
