# ReadSync

Cross-device reading progress sync for web novels. A Tampermonkey userscript
tracks your scroll position on NovelArrow/NovelBin chapter pages and syncs it
in real time to every other device you read on.

## Stack

- **Backend** — Node.js, Express 5, TypeScript (`src/`), Postgres (Supabase-hosted)
- **Frontend** — React 19 SPA served at `/app` (`frontend/`)
- **Browser client** — Tampermonkey userscript (`userscript/`)
- **Realtime** — Socket.IO, so progress updates appear live across open tabs/devices

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
