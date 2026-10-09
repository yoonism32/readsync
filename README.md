# ReadSync

Cross-device reading progress sync for web novels. A userscript
(Tampermonkey/Violentmonkey) tracks your position on chapter pages and syncs
it to a small server; a React dashboard updates live over Socket.IO.

## Stack

- **Backend** — Node.js, Express 5, TypeScript (`src/`), Postgres
- **Frontend** — React 19 SPA served at `/app` (`frontend/`)
- **Browser client** — userscript (`userscript/`)

See [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) for data flow and auth.

## Quick start

```bash
npm run setup   # install + start the dev server
```

Requires a Postgres database. Copy `.env.example` to `.env` and fill in
your own values.

```bash
npm run build:all   # backend + frontend + userscript
npm test
```

## Documentation

[`docs/`](./docs/README.md) — architecture, API reference, database, testing.

## License

MIT
