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

## Absorbed from the two roadmap artifacts

**"ReadSync — 30 SSS Features"** (2026-08-03) — the bulk of these shipped and are ticked off in
*Recently completed* above. The four still open are tracked as F11–F14.

**"Build Report & What You're Missing"** — audit of the same run. Two gaps it identified:

- [ ] **Bot admin panel** — still legacy-only, never ported to the React SPA
- [ ] **Raw API explorer** — still legacy-only

And nine ideas it raised that remain open:

- [ ] Per-novel update cadence, rather than a flat hiatus timer
- [ ] Recommendations drawn from your own shelf, not a stranger's algorithm
- [ ] "Since you left" digest on login
- [ ] Per-novel finish ETA
- [ ] Mirror & duplicate detector
- [ ] A "reading personality" page
- [ ] Sync conflicts made visible in History
- [ ] Installable, one-tap-to-reading
- [ ] Time-capsule notes

---

## SSS+ — 50 new directions

> None of these appear in the 30 SSS list, the Build Report, or anything above.
> ★ = my pick. Rationale is the last clause of each line.

### A. Language & text — the biggest untapped surface

You read machine-translated Chinese web novels. Nothing in any previous list touches the *text*.

1. ★ **Glossary builder** — extract characters, sects, techniques per novel from chapter text; MTL renames things constantly and you're holding it all in your head.
2. ★ **Pronoun-drift detector** — flag chapters where a character's gender flips mid-scene; readers complain about exactly this on your own shelf.
3. **Translation-quality score** — per-chapter MTL-artifact heuristics (repetition, broken clauses) so you know if a novel changed translator.
4. ★ **Catch-up summary** — "you left this 3 months ago, here's what happened since" for the long tail of 131 novels.
5. **Cliffhanger scoring** — rank chapter endings so you can stop at a clean break.
6. **Reading-difficulty index** — sentence length and vocabulary spread per novel.
7. **Arc boundary detection** — infer volume/arc breaks from chapter title patterns.
8. **Character first-appearance index** — jump to where anyone was introduced.
9. **Term-drift alerts** — a name changes spelling mid-novel, which happens constantly with MTL.
10. **"Who is this again?"** — hover recall for names, built from the glossary.

### B. Premium-chapter economics

Discovered during the August session: novelarrow gates chapters behind Keys, and nothing models it.

11. ★ **Free vs premium ledger** — which chapters are gated, so `latest_chapter_num` stops conflating the two.
12. **Keys cost-to-catch-up** — what finishing a novel would actually cost.
13. **Free-unlock forecaster** — predict when a paid chapter drops free, from historical cadence.
14. **Wait-or-pay advisor** — combines the two above into one call.

### C. Source resilience & archival

novelbin → novelarrow already happened once. Assume it happens again.

15. ★ **Chapter text archival** — snapshot what you've read; the only defence against a site vanishing.
16. ★ **Source-migration mapper** — auto-remap slugs when a site rebrands, instead of a manual migration.
17. **Multi-mirror health monitor** — track which mirrors are alive.
18. **Dead-link resurrection** — fall back to archive.org.
19. **Slug-change detector** — catch renames before they read as regressions.
20. **Content-hash change detection** — spot silently re-translated or edited chapters.

### D. Data integrity — generalising this session's bugs

21. ★ **Progress anomaly detector** — flag impossible jumps; the guard already logs them, nothing surfaces them.
22. ★ **Snapshot provenance** — record which device and which scrape strategy wrote each value.
23. **Chapter-count history** — time-travel view of how a novel's count changed and what wrote each change.
24. **Scrape confidence score** — the detector now weighs several candidates; persist how much they agreed.
25. **Self-healing reconciliation** — a job that re-derives stored values and reports drift.

### E. Reading ergonomics

26. **Fatigue detection from scroll velocity** — distinct from time tracking; measures *how* you're reading.
27. **Cold open** — re-render the last few paragraphs you read before resuming.
28. ★ **Chapter length preview** — words and estimated minutes before you commit to opening it.
29. **Adaptive autoscroll** — the userscript's Shift+S speed matched to your measured rate.
30. **Sunset-aware theme** — shift warmth by local time, not a manual toggle.

### F. Library-level intelligence

31. **Shelf overlap map** — cluster your 131 by shared tropes and authors.
32. **Abandonment predictor** — likelihood *you* drop it, as opposed to the novel going dead.
33. **Tonight's pick by time budget** — "I have 40 minutes", not a recommendation engine.
34. ★ **Backlog debt meter** — chapters accumulating vs your actual read rate, across the whole shelf.
35. **Series and sequel linker** — connect related novels into one lineage.

### G. Infrastructure

36. ★ **Read-model materialisation** — a maintained "latest per device per novel" table; the concrete fix for the `SubPlan 2` problem in the ops list.
37. **Event-sourced progress** — treat snapshots as an append-only log with derived views.
38. **Multi-tenant readiness** — the schema is already per-user; the auth layer is single-tenant.
39. ★ **Scraper canary** — synthetic check that fetches a known novel hourly and alerts on drift; tonight's two detection bugs ran silently for weeks.
40. ★ **Scraper contract tests against fixture HTML** — `__tests__/fixtures/` already holds saved pages and nothing asserts against them.

### H. Interop & export

41. **OPDS / Calibre feed** — plug into an existing ebook stack.
42. **EPUB generation** from archived chapters (needs #15).
43. **iCal release feed** — subscribe to update schedules in a normal calendar.
44. ★ **Outbound webhooks** — generic automation hooks; you already run Home Assistant.
45. **ntfy / Matrix notifications** — self-hosted push, no Discord dependency.

### I. Signature

46. **Ambient hardware indicator** — surface "new chapters" on Home Assistant or desk lighting.
47. ★ **TTS playback with position sync** — listen and keep the same progress model.
48. **E-ink target** — a stripped, high-contrast route for a reader device.
49. ★ **Local LLM sidecar** — summaries and glossaries on your own RTX 3050 rather than an API.
50. **Reading receipt** — print a physical end-of-month slip, purely because it's absurd.

**If you only take five:** #36 (fixes a known bottleneck), #39 and #40 (would have caught this
session's silent bugs), #15 (existential — the source already migrated once), #1 (the single
biggest quality-of-life gap for MTL reading).

---

*Not a todo app. A real system with real engineering.*
