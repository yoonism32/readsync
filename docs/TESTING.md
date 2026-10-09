# Testing

## Running

```bash
npm test          # vitest run — backend + userscript tests together
npm run test:watch
```

`vitest.config.ts` picks up `__tests__/**/*.test.ts` and
`userscript/__tests__/**/*.test.ts` in one run (`environment: 'node'`, DB
env vars stubbed to a non-existent `localhost:5432` in
`__tests__/setup.ts`).

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

## Not yet covered

- Route-level integration tests for the Express app (backend tests call exported functions directly).
- DOM-dependent extractors in `ChapterDetector.ts`.
- `ErrorBoundary` / crash-recovery logic.
