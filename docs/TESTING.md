# Testing

## Running

```bash
npm test          # vitest run — backend + userscript tests together
npm run test:watch
```

`vitest.config.ts` picks up `__tests__/**/*.test.ts` and
`userscript/__tests__/**/*.test.ts` in one run (`environment: 'node'`, DB
env vars stubbed to a non-existent `localhost:5432` in
`__tests__/setup.ts` — see "What's not covered" below for what that means
in practice).

Frontend tests run separately, from `frontend/`:

```bash
cd frontend && npm test   # or the frontend's own test script
```

## Coverage by surface

| Surface | Test files | What's covered |
|---|---|---|
| Backend (`src/`, `__tests__/regression/`) | 24 | Pure business logic: auto-reread detection, chapter-regression correction, cover mirroring/upload, normalization, streaks, migrations, rate-limit config, `normalizeBody`, and (since this audit) the admin-auth fix and the userscript/bot URL-derivation parity |
| Userscript (`userscript/__tests__/`) | 2 | base64 helpers, cover-upload caching |
| Userscript `ChapterDetector.ts` (`__tests__/regression/`) | 2 of the 24 above | URL/path parsing: `parseChapterEnhanced`, `isChapterPath`, `normalizePath`, plus (since this audit) `normalizeUrl`, `normalizeNovelId`, `extractChapterNum`, `extractChapterFromUrl`, `buildChapterPath`, `deriveNovelBaseUrl` |
| Frontend (`frontend/src/`) | 4 | Login page, Novel page, `useRefreshAll` hook, Explorer filters |
| Bot (`bot/src/`) | 0 | Nothing |

## What's not covered (known gaps)

- **No route/integration tests** for the Express app as a whole — every
  backend test calls exported functions directly, not HTTP endpoints,
  except the one added for the admin-auth fix (`adminAuth.test.ts`), which
  mounts `adminRouter` standalone rather than the full `createApp()` (the
  full app's session store needs a live Postgres connection this test
  environment doesn't have). `supertest` is installed but otherwise unused.
- **`ChapterDetector.ts`'s DOM-dependent functions are untested**:
  `extractLatestChapterInfo` (the most complex function in the file — see
  its own comments about a real production incident on 2026-08-06 that this
  audit did not add regression coverage for), `extractHeaderChapterCount`,
  `extractGenres`, `extractAuthor`, `extractCoverUrl`, `extractUpdateTime`.
  These all read a live `document`, which the current test setup doesn't
  stub beyond a minimal `document.title`/`querySelectorAll` shim.
- **`ErrorBoundary`/crash-recovery logic is untested** — the fix for the
  "SPA goes blank on stale chunk hash" bug (commits `be1d142`, `11089c5`)
  has no test, despite being some of the highest-value code to protect from
  regression.
- **`bot/src/` has zero tests.** Lower priority while the bot stays
  disabled in production (see [ARCHITECTURE.md](./ARCHITECTURE.md)), but
  worth adding before ever re-enabling it — particularly around
  `NovelScraper.ts`'s 403/429 cooldown detection, which likely doesn't fire
  as intended (string-matches an exception message that Puppeteer doesn't
  throw for non-2xx responses with `waitUntil: 'domcontentloaded'`).
