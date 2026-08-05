# ReadSync Level Up — 2026

> **Single source of truth for future work.** Consolidates the old `future_ideas.md`
> backlog, the deferred SSS roadmap specs, and the ops findings from the August 2026
> database session. `future_ideas.md` is kept only for its long-form specs — status
> is tracked *here*.

Legend: `[x]` done · `[ ]` open · `[~]` partially done

---

## Recently completed — 2026-08-04 / 08-05 session

### Security & database
- [x] **RLS lockdown** — all 13 public tables. Anon key had `SELECT/INSERT/UPDATE/DELETE/TRUNCATE`
      on everything with RLS off; `/rest/v1/progress_snapshots` returned 206 + 63,488 rows to a
      publishable key. Now 401 on every path. (`007_rls_lockdown.sql`)
- [x] **Blanket grants revoked** from `anon`/`authenticated`, plus default privileges so new
      tables don't inherit them.
- [x] **Data API (PostgREST) disabled entirely** — structural fix on top of the policy fix.
      Also removed the `pg_timezone_names` schema-cache reload that was ~21% of all DB time.
- [x] **Storage listing policy dropped** — `novel-covers` is public, so object URLs work without
      the broad `SELECT` on `storage.objects` that let anyone enumerate every file.
- [x] **Postgres 17.4 → 17.6.1.155**, plus `REINDEX SCHEMA public` and
      `ALTER DATABASE … REFRESH COLLATION VERSION` for the ICU 153.120→153.121 mismatch the
      upgrade introduced.
- [x] **`search_path` pinned** on `update_updated_at_column`.
- [x] Verified 16 MB pre-upgrade dump at `/mnt/Extra/pgdb/` (63,487 rows, cross-checked against
      the PostgREST row count).

### Bugs
- [x] **Novel removal was broken for every novel** — Express 5 leaves `req.body` undefined when
      no parser matched; the route destructured it *above* its own `try`, so the TypeError
      bypassed `handleDbError` and surfaced as an opaque 500. Fixed once via `normalizeBody`
      middleware rather than at 19 call sites.
- [x] **NovelArrow chapter detection** — the `og:novel` meta short-circuited the max-scanning
      strategies, and the DOM fallback only sees the first 30 server-rendered chapters. Now reads
      the header's "N Chapters" figure and takes the max of all candidates.
- [x] **Digit-leading slugs misread as chapter pages** — `100x-rebate-…` tripped the `/^\d+/`
      heuristic, which silently disabled auto-update *and* made progress sync record scroll
      position on the novel main page. Shared `isChapterPath` now requires the path to sit below
      the slug.
- [x] **Silent auto-update guards** — two paths returned without notifying the opener, costing a
      30s timeout each and mislabelling a deliberate skip as a hang.
- [x] **Covers never mirrored** — 13 of 132 novels hotlinked the source because the admin
      auto-update wrote `cover_img` first and `covers.ts` short-circuited on any cached URL.
- [x] **Sessions lived in process memory** — `express-session` with no store meant every deploy
      and every free-tier hibernation logged you out, appearing as a broken app because
      `requireAuthAPI` gates only the API while the SPA still served. Now `connect-pg-simple`
      on the existing pool. (`009_session_store.sql`)

### Performance
- [x] **My List query 300ms → 108ms**, buffers 31,354 → 11,853. Was 60% of all database time.
      One-off `VACUUM` (the CTE was doing 62,735 heap fetches from a nominally index-only scan
      after the upgrade ran statistics-only) plus two indexes matching each subquery's `ORDER BY`.
      (`008_progress_snapshot_indexes.sql`)

### Product (verified present in `frontend/src/`)
- [x] Notes, refresh persistence, quick filters, bulk status, export/import, sort persistence,
      tags/categories, unread counter (features 1–8)
- [x] Command Palette (Ctrl+K) · Activity Heatmap · Explorer with tri-state genre filters ·
      History · Manage · Admin · Notification bell · Chapter map · Re-read panel

---

## Open — Ops & infrastructure

Carried out of the August session. Roughly ordered by value.

- [ ] **Egress at 69% of free tier** (3.47 / 5 GB, 22 days left). Re-read now that `/novels`
      moves 62% less data per call. Supabase egress counts *every* pooler result crossing to
      Render, so the query fix should show up here.
- [ ] **`SubPlan 2` in the My List query** — the remaining 89% of its cost. Reads 589 rows per
      novel to return 1, because Postgres has no index skip-scan for `DISTINCT ON`. Needs a
      `LATERAL` rewrite or a denormalised "latest per device per novel" table maintained by the
      sync. **Design change, not tuning — decide before starting.**
- [ ] **Harden the migration runner.** `migrate.ts:75` splits files on `;`, so any `DO` block,
      function body, or semicolon inside a comment breaks it — this crashed a deploy on
      2026-08-04. Make it dollar-quote aware (~20 lines) and the whole class disappears.
      A split-simulation check exists as an ad-hoc script; fold it into the test suite.
- [ ] **Rotate off the legacy anon key.** Don't rotate the JWT secret — it invalidates
      `service_role` too, which Storage depends on. Migrate to publishable/secret keys: create a
      secret key → update `SUPABASE_SERVICE_KEY` on Render → verify covers + backups → then
      deactivate legacy. Both systems run in parallel, so no downtime window.
- [ ] **Delete the dead `SUPABASE_KEY` export** (`config.ts:82`) — falls back from service key to
      anon key and is never read. Harmless now, a trap once legacy keys are deactivated.
- [ ] **7 unindexed foreign keys** (all `novel_id`), INFO level. Be selective: `progress_snapshots`
      takes constant writes, and an index there buys faster cascade deletes you rarely perform.
- [ ] **`realChapterCount` module cache** (`ChapterDetector.ts:81`) is never reset per novel. It
      can no longer override a larger value, and Refresh All is immune (fresh tab per novel), but
      browsing several novels in one tab can still surface a stale count.
- [ ] **`extractChapterNum` caps at `< 10000`** — silently drops novels past 10k chapters. Not hit
      today (max is ~7,600).
- [ ] **`tab.closed` counts as success** (`useRefreshAll.ts:68`) — any external close is banked as
      a win with no scrape. Deliberately left; a test documents the behaviour if you want to flip it.
- [ ] **Userscript isn't served.** `dist-userscript/` is gitignored and no route exposes it, so
      Render's `build:all` builds it for nothing and updates are a manual reinstall. Serving it
      plus `@updateURL`/`@downloadURL` would make Tampermonkey self-update.
- [ ] **API documentation (OpenAPI/Swagger).** The last genuinely-open item from the old
      `executive_sum.md` checklist — its other four (TypeScript, automated tests, structured
      logging, frontend framework) are all done.

---

## Open — Product features

### Tier 1: deferred SSS specs (infra already exists)

Full specs in the section below; these are UI + light-endpoint projects. All new UI goes in
`frontend/`, never the legacy vanilla pages.

- [ ] **F12 — Per-novel stats page** (`/app/novel/:id/stats`). Start here: the endpoint
      `GET /api/v1/stats/novels/:novelId` already returns everything and is completely unused.
- [ ] **F11 — Full stats page** (`/app/stats`). Needs one new `stats/breakdown` endpoint;
      `stats/summary` and `stats/daily` already exist.
- [ ] **F13 — Reading goals.** No migration needed — store as JSON under `user_settings`.
- [ ] **F14 — Reading Wrapped.** Seasonal; ship in December. `computeStreaks` already exists.

**Build order when picked up:** F12 → F11 → F13 → F14.

### Tier 2: technically impressive

- [ ] **Offline-first PWA** — service worker, IndexedDB, background sync queue. No PWA plugin in
      `frontend/vite.config.ts` yet.
- [ ] **Chrome Extension (Manifest V3)** — graduate from the Tampermonkey userscript.
- [ ] **CLI tool** — `readsync status|list|progress|sync|export`, npm-publishable.
- [ ] **GraphQL API** alongside REST.
- [ ] **CRDTs for conflict resolution** — replace last-write-wins with Automerge/Yjs.
- [ ] **Reading analytics engine** — completion ETA, velocity, peak hours, burnout detection.

### Tier 3: signature "wow"

- [ ] **Reading Time Machine** — scrubable animated timeline of the whole library.
- [ ] **Ghost positions** — faint markers showing where other devices left off.
- [ ] **Live reading indicator** — Socket.io is already in place.

### Tier 4: power-user features (specs in `future_ideas.md` §9–17)

- [ ] Dead novel detection & auto-triage (#10)
- [ ] Unified search across notes, bookmarks, novels, tags (#11)
- [ ] Theme engine & custom accent colours (#12)
- [ ] Batch import from URLs (#13)
- [ ] Chapter highlights & annotations, userscript-side (#14)
- [ ] Auto-cleanup & maintenance mode (#16)
- [ ] Userscript reading modes (#17)

### Abandoned

- [~] **Tailwind CSS migration** (Feb 2026) — started, went wrong, commits to be reverted.
      See `future_ideas.md`. The design system has since moved on; treat as closed unless
      revisited deliberately.

---

## Deferred feature specs — F11–F14

> Written 2026-08-03. The infrastructure these need already exists.

### F11 — Full stats page (`/app/stats`)

Chapters per day/week/month, busiest reading hour, per-device split, session-length distribution.

**Existing:** `GET /api/v1/stats/summary` (totals, status counts, session aggregates, includes
`plan-to-read`); `GET /api/v1/stats/daily?days=N` (per-day snapshot events, novels touched,
chapters read, sessions, seconds — the ActivityHeatmap already consumes this). `reading_sessions`
is populated server-side on every accepted sync (`af00cfc`), so time-based stats are real data.

**To build:** `GET /api/v1/stats/breakdown` following `stats.ts` patterns — busiest hour via
`EXTRACT(HOUR FROM created_at)`, per-device split joining `progress_snapshots` → `devices`,
weekday via `EXTRACT(DOW FROM created_at)`. Then `frontend/src/pages/Stats.tsx` + nav entry in
`Layout.tsx`. Reuse the heatmap; hand-rolled SVG bars rather than a chart library (matches the
design system, keeps the bundle lean). Week/month rollups computed client-side from one
`days=365` fetch.

### F12 — Per-novel stats (`/app/novel/:id/stats`)

Reading pace, total time, sessions, devices used, progress-over-time, read-through history.

**Existing:** `GET /api/v1/stats/novels/:novelId` **already returns all of it and is unused** —
novel meta, `read_history` JSONB, `current_read_through`, first/last read, max progress, devices
used, session totals, bookmark count.

**To build:** `frontend/src/pages/NovelStats.tsx`, linked from a Stats button on the Novel page.
For the sparkline add optional `?series=1` returning
`SELECT DATE(created_at), MAX(chapter_num) … GROUP BY DATE(created_at)` — ~15 lines.
Pace = (max_chapter − first_chapter) / days between first and last read; ETA = behind ÷ pace.

### F13 — Reading goals

Targets like "1,000 chapters this year" or "30 min/day", with pace bars on the Dashboard.

**Existing:** `user_settings` is a per-user key/value store with GET/POST routes
(`src/routes/settings.ts`). Store goals as one JSON value under `reading_goals` — no migration:

```json
{ "chapters_per_year": 1000, "minutes_per_day": 30, "set_at": "2026-08-03" }
```

**To build:** goal editor in Settings (two numeric inputs, existing POST). `GoalBar` on Dashboard
showing expected-by-today vs actual with an "ahead/behind by N" label. If no goal is set, render
nothing — no nag UI.

### F14 — Reading Wrapped

Annual recap: total chapters, hours, busiest day, longest streak, top 5 novels, completions.

**Existing:** everything computable from `stats/daily?days=365`, `stats/summary`,
`reading_sessions`, `progress_snapshots`. `computeStreaks` (`frontend/src/lib/streaks.ts`) gives
longest streak.

**To build:** `GET /api/v1/stats/wrapped?year=2026` as one query batch. `frontend/src/pages/
Wrapped.tsx` with scroll-snap slides, `--font-display` + gold glow. Ship in December; the
"your Wrapped is ready" row can reuse the notifications table (`type: 'wrapped'`).
Export-as-image optional — a print stylesheet is the cheap version.

---

*Not a todo app. A real system with real engineering.*
