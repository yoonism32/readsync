# ReadSync: agent instructions

Do not include Co-Authored-By lines in commit messages.

## Read first

- [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md): how the system works today.
- [docs/README.md](./docs/README.md): index of every doc. It separates
  current docs from historical records.
- [CONTRIBUTING.md](./CONTRIBUTING.md): setup, checks, conventions,
  migrations.
- [SECURITY.md](./SECURITY.md): the trust boundaries you must not weaken.

## Layout

- `src/`: Express 5 + TypeScript API, Socket.IO, raw `pg`.
  Migrations are in `src/db/migrations/`.
- `frontend/`: React 19 SPA, built into `public/app/` and served at `/app`.
- `userscript/`: Tampermonkey/Violentmonkey client, built into
  `dist-userscript/`.
- `__tests__/`: backend and userscript tests, run by the root vitest.
- `dist/`, `public/app/`, `dist-userscript/`: build outputs, gitignored.

## Commands

| Purpose | Command |
|---|---|
| Backend tests | `npm test` |
| Type check | `npm run typecheck` |
| Lint/format check | `npm run check` |
| Everything CI runs | `npm run verify` (needs `API_KEY` + `USERSCRIPT_UPDATE_TOKEN` for the userscript build) |
| Full production build | `npm run build:all` |

## Rules

- Protect three contracts: reading progress, authentication, and the Socket.IO
  events (`progress:updated`, `chapters:updated`). If a change spans the
  userscript, API and dashboard, make it as one coordinated change.
- Migrations are append-only and numbered. Never edit one that has been
  applied (see CONTRIBUTING.md).
- Use raw parameterized `pg` queries. Don't add an ORM. Don't assume Supabase
  client calls can replace the existing SQL.
- Never read or print `.env`. Never commit secrets or build outputs.
- Docs describe only shipped behaviour. Leave dated audits and
  `docs/changelog/` as historical records.
