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
| Backend (`src/`, `__tests__/regression/`) | 33 | Pure business logic: auto-reread detection, chapter-regression correction, cover mirroring/upload/source-fallback/failure-poisoning, normalization, streaks, migrations, rate-limit config, `normalizeBody`, half-star rating validation, hiatus badges, smart filters, stats breakdown/velocity, NovelArrow synopsis parsing |
| Userscript (`userscript/__tests__/`) | 6 | base64 helpers, cover-upload caching, completion sync, heartbeat sync, stale-rejection handling |
| Userscript `ChapterDetector.ts` (`__tests__/regression/`) | 4 of the 33 above (`chapterDetectorPureFunctions`, `chapterCorrection`, `latestChapterDetection`, `userscriptChapterDetection`) | URL/path parsing: `parseChapterEnhanced`, `isChapterPath`, `normalizePath`, `normalizeUrl`, `normalizeNovelId`, `extractChapterNum`, `extractChapterFromUrl`, `buildChapterPath` |
| Frontend (`frontend/src/`) | 12 | Login page, Novel page, `useRefreshAll` hook, Explorer filters, My List table, rating stars, and others |

## What's not covered (known gaps)

- **No route/integration tests** for the Express app as a whole — every
  backend test calls exported functions directly, not HTTP endpoints. The
  one exception, `adminAuth.test.ts` (mounted `adminRouter` standalone to
  regression-test an unauthenticated `force-refresh-all`), was removed
  2026-09-08 along with the route it covered — see
  [ARCHITECTURE.md](./ARCHITECTURE.md#the-bot-was-removed). `supertest` is
  installed but currently unused.
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
- **The bot (`bot/src/`) was removed 2026-09-08**, not just untested — see
  [ARCHITECTURE.md](./ARCHITECTURE.md#the-bot-was-removed). Its
  `NovelScraper.ts` 403/429 cooldown-detection bug (string-matched an
  exception message Puppeteer doesn't actually throw for non-2xx responses)
  is moot now rather than a gap to close.
