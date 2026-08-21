# ReadSync

Cross-device reading progress sync for web novels. A userscript (Tampermonkey,
Violentmonkey, or any other GM-compatible manager) tracks your scroll position
on NovelArrow/NovelBin chapter pages and syncs it to the server as you read;
the dashboard picks up new progress live over Socket.IO (`chapters:updated`
and `progress:updated` events patch/refetch the SWR cache), with a 30-minute
SWR poll as a fallback if the socket connection drops.

## Stack

- **Backend** — Node.js, Express 5, TypeScript (`src/`), Postgres (Supabase-hosted)
- **Frontend** — React 19 SPA served at `/app` (`frontend/`), kept in sync via
  Socket.IO — see [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)
- **Browser client** — userscript, built for Tampermonkey/Violentmonkey (`userscript/`)

Full architecture, data flow, and auth model: [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md).

## Quick start

```bash
npm run setup   # npm install + start the dev server (tsx watch src/server.ts)
```

You'll also need a Postgres database (`DATABASE_URL`) and an admin password
hash — see [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md) for the full env var
list and how to generate the password hash.

To build everything (backend + frontend + userscript) for production:

```bash
npm run build:all
```

## Documentation

Everything else lives in [`docs/`](./docs/README.md) — architecture, the
full API reference, database/migration history, deployment runbook, test
coverage map, and the open roadmap.

## License

MIT
