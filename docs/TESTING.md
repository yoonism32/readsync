# Testing

## Running

```bash
npm test          # vitest run — backend + userscript tests together
npm run test:watch
```

`vitest.config.ts` picks up `__tests__/**/*.test.ts` and
`userscript/__tests__/**/*.test.ts` in one run (`environment: 'node'`, DB
env vars stubbed to a non-existent `localhost:5432` in
`__tests__/setup.ts`. Integration tests are the exception; see below).

Frontend tests run separately, from `frontend/`:

```bash
npm test --prefix frontend   # vitest run, jsdom
```

## Everything at once

```bash
npm run verify
```

`npm run verify` runs, in order:

1. Backend + userscript tests.
2. `tsc --noEmit`.
3. `biome check src/`.
4. Frontend lint.
5. Frontend tests.
6. Frontend build.
7. Userscript build.

The userscript build needs `API_KEY` and `USERSCRIPT_UPDATE_TOKEN` (see
[USERSCRIPT.md](./USERSCRIPT.md#build)). CI runs this exact command
(`.github/workflows/verify.yml`) on every push to `main` and on every pull
request, using repository secrets for those two values.

`./scripts/setup-git-hooks.sh` installs a pre-push hook that runs `npm test`
and `tsc --noEmit`.

## Integration tests (optional, real Postgres)

`__tests__/integration/` holds 4 files: compact backup, recovery, stats
replay and status report. They run against a real database and are skipped
unless `READSYNC_TEST_DATABASE_URL` is set. `__tests__/setup.ts` refuses
anything except a **localhost** database named `readsync_audit`, so a
production URL can never be used by mistake:

```bash
createdb readsync_audit
READSYNC_TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/readsync_audit npm test
```

Tests never load `.env`. The setup file sets its own dummy secrets.

## Coverage by surface

File counts as of 2026-10-26:

| Surface | Test files | What's covered |
|---|---|---|
| Backend (`__tests__/regression/`) | 45 | Business logic: auto-reread detection, chapter-regression correction, progress policy, cover mirroring/upload/resize/source-fallback/failure-poisoning, normalization, streaks, migrations and the SQL splitter, rate-limit config, `normalizeBody`, half-star rating validation, hiatus badges, smart filters, stats breakdown/device breakdown/velocity/replay, status report, synopsis parsing, alerter, backup inventory and size limits, env API key, NovelPing URLs and navigation |
| Backend HTTP | included above | `supertest` drives the real routers in `userscriptRoute`, `statusReport`, `statsReplay`, `novelSynopsis`, `novelRatingValidation` and `statsDeviceBreakdown`. `securityBoundaries` and `socketAuth` cover the auth boundaries |
| Backend integration (`__tests__/integration/`) | 4 | End-to-end against Postgres (see above; skipped by default) |
| Userscript (`userscript/__tests__/`) | 8 | API key, base64 helpers, cover-upload caching, completion sync, heartbeat sync, offline queue, real chapter-count cache, stale-rejection handling |
| Userscript `ChapterDetector.ts` (in `__tests__/regression/`) | 6 of the 45 above (`chapterDetectorPureFunctions`, `chapterCorrection`, `latestChapterDetection`, `userscriptChapterDetection`, `novelpingUserscript`, `pageMetadata`) | URL/path parsing (`parseChapterEnhanced`, `isChapterPath`, `normalizePath`, `normalizeUrl`, `normalizeNovelId`, `extractChapterNum`, `extractChapterFromUrl`, `buildChapterPath`), `extractLatestChapterInfo`, and the page-metadata extractors |
| Frontend (`frontend/src/`) | 19 | Login page, Novel page, `useRefreshAll` hook, Explorer filters, My List table, rating stars, and others (jsdom, `frontend/vitest.config.ts`) |

## What's not covered (known gaps)

- **`ErrorBoundary`/crash-recovery logic is untested** — the fix for the
  "SPA goes blank on stale chunk hash" bug (commits `be1d142`, `11089c5`)
  has no test, despite being some of the highest-value code to protect from
  regression.
- **The bot (`bot/src/`) was removed 2026-09-08**, not just untested — see
  [ARCHITECTURE.md](./ARCHITECTURE.md#the-bot-was-removed). Its
  `NovelScraper.ts` 403/429 cooldown-detection bug (string-matched an
  exception message Puppeteer doesn't actually throw for non-2xx responses)
  is moot now rather than a gap to close.
