# ReadSync Level Up — 2026

> **Single source of truth for future work.** Consolidates the old `future_ideas.md`
> backlog, the deferred SSS roadmap specs, and the ops findings from the August 2026
> database session. `future_ideas.md` is kept only for its long-form specs — status
> is tracked *here*.

Legend: `[x]` done · `[ ]` open, accepted · `[~]` partially done · ~~struck~~ declined (rated N)

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

## Recently completed — 2026-08-06 session

### Userscript-assisted cover mirroring
- [x] **`GM_xmlhttpRequest` cover upload** — images.novelarrow.com blocks Render's datacenter
      egress (403) and sends no CORS headers, so the server has no route to cover bytes at all.
      The userscript (v5.6.0, `@grant GM_xmlhttpRequest`) now fetches the cover from the reader's
      own connection and POSTs it to a new `POST /api/v1/covers/:novelId/upload`, which sniffs the
      actual JPEG magic bytes rather than trusting the claimed content-type before writing into
      the public bucket. `commitMirroredCover()`/`normalizeSlug()` extracted so the GET mirror
      route and the new upload route share one code path instead of duplicating it.

### Bugs — chapter-count inflation and its blast radius
- [x] **Header chapter count beating a titled meta chapter** — NovelArrow's "`<N>` Chapters"
      header is a document *count*, not a chapter *number* (bonus/side entries like "897_2"
      inflate it past the true latest). Three novels in production had `latest_chapter_num`
      permanently 1–14 higher than any real chapter, each provably wrong because the *title*
      still named the correct lower chapter. Fixed in `ChapterDetector.ts`: a titled meta/
      `.l-chapter` number now always outranks the bare header count.
- [x] **The same regression-lock bug existed unpatched in the far more common write path** —
      tonight's first fix only wired self-healing into `admin.ts`'s novel-page auto-update, but
      `progress.ts`'s per-chapter sync (which fires on nearly every page read) wrote
      `latest_chapter_num` through a bare `GREATEST()` with no correction path at all. Extracted
      the guard into `src/services/ChapterCorrection.ts` (`isChapterRegression`,
      `isConfirmedChapterCorrection`, `recordCorrectionAttempt` — a single scrape reporting fewer
      chapters is rejected, the *same* lower number reported twice is trusted) and wired it into
      **both** writers, since they share one column and one pending-correction map.
- [x] **Auto-reread false-positive on a second device** — reread detection compared a novel-wide
      max chapter against the syncing device's current chapter. Opening a novel for the first time
      on a new device at an early chapter could read as "500 chapters behind" and fabricate a
      completed read-through with a false completion date. Fixed by scoping the max-chapter query
      to the requesting device (`isAutoReread()`, `progress.ts`) — a genuine reread almost always
      happens on the same device that was previously caught up.
- [x] **Backups and exports could understate progress** — `ExportService.ts` picked the
      *most-recently-written* snapshot per novel instead of the furthest-progressed one, so a
      brief out-of-order glance at an earlier chapter on a second device would report that lower
      chapter in the daily backup and any manual export. Reordered to match the app's established
      `chapter_num DESC, percent DESC, created_at DESC` convention (`NovelService.ts`'s
      `getLatestStates`, the My List query). Same bug, same fix, recurred in `novels.ts`'s
      manual "mark as completed" synthetic snapshot — merged into one correctly-ordered query.

Full writeup, a 6-competitor market cross-reference, and 30 new market-informed feature
proposals: see the *ReadSync — Field Audit & Roadmap* artifact (2026-08-06).

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
> **Decided 2026-08-06:** F11 and F14 rated M (accepted, not yet scoped for a sprint — F14 also
> gained a data-scope caveat, see below). **F12 and F13 rated N — declined, specs kept below for
> reference only, not on the build list.**

### F11 — Full stats page (`/app/stats`) — accepted (M)

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

### ~~F12 — Per-novel stats (`/app/novel/:id/stats`)~~ — declined (N)

Reading pace, total time, sessions, devices used, progress-over-time, read-through history.

**Existing:** `GET /api/v1/stats/novels/:novelId` **already returns all of it and is unused** —
novel meta, `read_history` JSONB, `current_read_through`, first/last read, max progress, devices
used, session totals, bookmark count.

**To build:** `frontend/src/pages/NovelStats.tsx`, linked from a Stats button on the Novel page.
For the sparkline add optional `?series=1` returning
`SELECT DATE(created_at), MAX(chapter_num) … GROUP BY DATE(created_at)` — ~15 lines.
Pace = (max_chapter − first_chapter) / days between first and last read; ETA = behind ÷ pace.

### ~~F13 — Reading goals~~ — declined (N)

Targets like "1,000 chapters this year" or "30 min/day", with pace bars on the Dashboard.

**Existing:** `user_settings` is a per-user key/value store with GET/POST routes
(`src/routes/settings.ts`). Store goals as one JSON value under `reading_goals` — no migration:

```json
{ "chapters_per_year": 1000, "minutes_per_day": 30, "set_at": "2026-08-03" }
```

**To build:** goal editor in Settings (two numeric inputs, existing POST). `GoalBar` on Dashboard
showing expected-by-today vs actual with an "ahead/behind by N" label. If no goal is set, render
nothing — no nag UI.

### F14 — Reading Wrapped — accepted (M), scope caveat

Annual recap: total chapters, hours, busiest day, longest streak, top 5 novels, completions.

**Existing:** everything computable from `stats/daily?days=365`, `stats/summary`,
`reading_sessions`, `progress_snapshots`. `computeStreaks` (`frontend/src/lib/streaks.ts`) gives
longest streak.

**To build:** `GET /api/v1/stats/wrapped?year=2026` as one query batch. `frontend/src/pages/
Wrapped.tsx` with scroll-snap slides, `--font-display` + gold glow. Ship in December; the
"your Wrapped is ready" row can reuse the notifications table (`type: 'wrapped'`).
Export-as-image optional — a print stylesheet is the cheap version.

**Data-scope caveat, verified 2026-08-06 against production:** the DB was wiped for space in
late 2025, keeping only each novel's most-recent snapshot. Confirmed in `progress_snapshots` row
counts by month: 5 / 24 / 28 / 55 for Aug–Nov 2025, then 307 in December, then 32,955 in January
2026. A full calendar-year Wrapped would show almost nothing before December. Scope the first one
to a recent window (last 3–6 months) rather than the full year, or wait for a real first January.

---

## Absorbed from the three roadmap artifacts

**"ReadSync — 30 SSS Features"** (2026-08-03) — the bulk of these shipped and are ticked off in
*Recently completed* above. The four still open are tracked as F11–F14 above (two declined, two
accepted — see the caveats there).

**"Build Report & What You're Missing"** — audit of the same run. Two gaps it identified,
never rated, still genuinely open:

- [ ] **Bot admin panel** — still legacy-only, never ported to the React SPA
- [ ] **Raw API explorer** — still legacy-only

**"ReadSync — Field Audit & Roadmap"** (2026-08-06) — its 30 proposals are numbered 51–80 in
the SSS++ section below; decisions are marked inline there.

**Consolidation, 2026-08-06:** all three artifacts plus the Field Audit were merged into one
working doc (`docs/PROPOSAL_GATEWAY_2026-08-06.md`, committed for the decision trail) and run
through two rounds of Y/N/M. Full write-up, with every description checked against the actual
codebase, in the final artifact:
**[ReadSync, narrowed](https://claude.ai/code/artifact/43b105b2-3561-48eb-aa91-7a30b76d1316)**.

The build report's nine ideas, decided:

- [ ] **Per-novel update cadence, rather than a flat hiatus timer** — ~~declined (N)~~
- [ ] **Recommendations drawn from your own shelf** — ~~declined (N)~~
- [ ] **"Since you left" digest on login** — ~~declined (N)~~
- [ ] **Per-novel finish ETA** — ~~declined (N)~~
- [ ] **Mirror & duplicate detector** — **parked, not declined** — revisit once the library's
      grown enough for duplicate-novel forks (from a site re-scrape, as already happened once
      with the novelbin → novelarrow migration) to actually matter
- [ ] **A "reading personality" page** — **accepted (Y)**, paired with F14 Wrapped above — build
      it from `progress_snapshots` (real history since January), not `reading_sessions` (only 11
      rows total, all from the past 3 days, not a real history table yet)
- [ ] **Sync conflicts made visible in History** — **accepted (Y), conditional** — only ships
      with a manual resolve action on the History row (pick which device's position is correct),
      not as a read-only log entry
- [ ] **Installable, one-tap-to-reading** — ~~declined (N)~~
- [x] ~~Time-capsule notes~~ — dropped as a duplicate of spoiler-gated notes (below, also
      declined)

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

## SSS++ — 30 more, cross-referenced against the market

> Written 2026-08-06, from the *ReadSync — Field Audit & Roadmap* artifact. Checked against
> the 30 SSS list, the 50 SSS+ directions above, and everything else in this file, so nothing
> here restates a build already planned. Every entry is grounded in a specific competitor gap
> (Kavita, StoryGraph, Hardcover, Mihon, KOReader/KOSync, NovelUpdates — the 6 surveyed), not a
> generic "wouldn't it be nice." ★ = my pick.

> **Decided 2026-08-06:** rated Y/N/M against the actual codebase — full reasoning in the
> [final artifact](https://claude.ai/code/artifact/43b105b2-3561-48eb-aa91-7a30b76d1316). Legend
> below: ✅ accepted (Y) · 🟡 accepted, unscoped (M) · ❌ declined (N) · ⏳ explained, not yet rated.

### J. Interop & portability

51. ❌ ~~**Spoiler-tagged notes**~~ — blur until clicked, chapter-scoped so re-reading past that
    point auto-reveals it. *(Hardcover, StoryGraph)*
52. ★🟡 **NovelUpdates reading-list bridge** — two-way sync so the two lists stop drifting apart.
    *(NovelUpdates)*
53. ❌ ~~**AniList / MAL custom-list mirror**~~ — auto-set status/progress there for novels with
    an official entry. *(Mihon)*
54. ❌ ~~**Goodreads / StoryGraph import bridge**~~ — one-time import so ReadSync becomes the
    single reading ledger, not just the web-novel one. *(Bookwyrm, Hardcover)*
55. ★❌ ~~**KOSync-protocol-compatible endpoint**~~ — implement the actual KOReader sync-server
    API so archived EPUBs and web-novel progress share one account. *(KOReader/KOSync)*

### K. Social, lightly

56. ❌ ~~**Public read-only shelf page**~~ — opt-in shareable link, no login required to view.
    *(Hardcover, Bookwyrm)*
57. ❌ ~~**Buddy-read mode**~~ — two users track the same novel with a shared side-by-side view,
    opted in per novel. *(Bookwyrm)*
58. ❌ ~~**Household activity digest**~~ — weekly "who read what" for a multi-user deploy.
    *(Bookwyrm groups)*
59. ❌ ~~**Author / translator-group following**~~ — follow the person, not just the title.
    *(Hardcover lists)*
60. ❌ ~~**Community translation-quality signal**~~ — one honest aggregated number, not a review
    feed. *(StoryGraph aggregate stats)*

### L. Mood, pace & reading identity

61. ★❌ ~~**Mood & pace tagging**~~ — slow-burn/fast-paced, dark/light, filterable in Explorer.
    *(StoryGraph)*
62. ❌ ~~**DNF reason capture**~~ — one-tap reason on drop, then a personal "why you drop
    novels" insight card. *(StoryGraph)*
63. 🟡 **Time-boxed reading sprints** — opt-in 7-day challenges with a completion badge, distinct
    from F13's standing goal bar (F13 itself declined above). *(StoryGraph)*
64. ❌ ~~**Genre/mood variety challenges**~~ — a nudge toward variety, not just volume.
    *(StoryGraph)*
65. ❌ ~~**Pace-aware catch-up countdown**~~ — "will I ever catch up to live?", combining
    release cadence with your own pace. *(NovelUpdates)*

### M. Rating, depth & intent

66. ✅ **Half-star rating scale** — superseded by a firmer decision: a star-click control on the
    novel page (not MyList, not a dropdown — there was no rating UI anywhere in the app before
    this). Tracked as one item in the [final artifact](https://claude.ai/code/artifact/43b105b2-3561-48eb-aa91-7a30b76d1316),
    not duplicated here. *(Hardcover)*
67. ❌ ~~**"Would re-read?" intent flag**~~ — captured at completion, separate from the numeric
    rating. *(StoryGraph)*
68. ❌ ~~**Volume/arc-aware chapter list**~~ — the UI layer for arc-boundary detection (#A7) once
    that data exists. *(Kavita)*
69. ❌ ~~**Shared-universe family tree**~~ — the visual graph layer on top of simple sequel
    linking (#F35). *(Kavita)*
70. ❌ ~~**Voice-command chapter navigation**~~ — Web Speech API in the userscript overlay; the
    inverse of TTS (#47), commanding rather than being read to.

### N. Trust, made visible

71. ★✅ **Weekly data-health digest** — auto-corrections, cooldown'd mirrors, and rejected
    regressions from the past week, surfaced proactively instead of sitting in logs.
72. ⏳ **Per-novel freshness badge** — explained, not yet rated: a small "last verified" chip on
    the novel card, the UI-facing counterpart to #73's admin dashboard. *(Kavita "last scanned")*
73. ★❌ ~~**Admin scraper-health dashboard**~~ — surface the scraper canary (#39) and contract
    tests (#40) in the Admin page itself, so a silent detection failure is an alert, not a
    support ticket six weeks later.
74. ★❌ ~~**QR-code device pairing**~~ — scan a code from Settings to configure a new device
    instead of copying the raw API key by hand. The actual fix for the plaintext-key finding in
    the field audit — still open as a bug, just not via this proposal.
75. ❌ ~~**"Continue on {device}" resume toast**~~ — first chapter opened each session names
    which device you left off on and the exact position. *(KOReader/KOSync)*

### O. Infra & access

76. ❌ ~~**One-command Docker self-host bundle**~~ — app + Postgres + storage in one Compose
    file, closing the gap between Render+Supabase coupling and how genre-peers already ship.
    *(KOReader/KOSync, Mihon's SyncYomi)*
77. ❌ ~~**Discord bot with slash commands**~~ — `/readsync status`, `/readsync next <novel>`,
    not just a webhook ping (#44). *(Hardcover)*
78. 🟡 **Accessible reader overlay** — dyslexia-friendly font/spacing toggle plus ARIA
    live-region sync announcements, injected on the source page itself.
79. ✅ **Second-screen companion view** — a live ambient display, not a reading surface: a "now
    reading" state (cover, title, chapter, percent, session stats) when a progress sync is
    active, falling back to a "now scanning" state (from `getBotStatus()`) when idle. No direct
    analog in any reading tracker surveyed — closest patterns are Spotify's Now Playing view and
    Google Nest Hub's Ambient Mode, borrowed into an underserved niche. *(In design — full spec
    and open decisions in the TODO section right after this list. Pick up there, not from
    scratch. Accepted status doesn't mean started — this TODO section is a design doc, not a
    build log; it still counts as a live proposal.)*
80. ❌ ~~**Bulk "resume all" launcher**~~ — one click opens every "reading" novel at its
    next-chapter URL in background tabs, reusing Refresh All's tab orchestration for reading
    instead of scraping.

**Final decided list, all sources merged:** 12 items survived — #52, #63, #66(via Ratings),
#71, #78, #79 from this list, plus 6 more from the build-report ideas and F11/F14 above. Full
detail, checked against the actual codebase, in the
[final artifact](https://claude.ai/code/artifact/43b105b2-3561-48eb-aa91-7a30b76d1316).

---

## TODO next session — #79 Second-screen companion, design in progress

> Started 2026-08-06. Scoping discussion got partway through and was parked — pick up from
> "open decisions" below, don't re-derive the concept from scratch.

**The reframe.** First pass treated this as a *reading surface* (phone mirrors the desktop
chapter, you could read from either). Correct framing, from direct feedback: it is **not** for
reading. It's an **ambient status display** — something you glance at, not read from. That
reframing is what makes it interesting; it isn't just "My List on a second screen."

**Two states, not one.**
- **Reading state** — a progress sync is actively coming in. Show it big: cover, title,
  chapter, percent. Modeled on Spotify's Now Playing view and Plex/Jellyfin active-stream
  dashboards, where the art becomes the hero the moment something's playing.
- **Idle state** — nothing synced recently. *Not blank.* Show library/scan status instead —
  modeled on Google Nest Hub's Ambient Mode, which swaps to weather/clock/photos rather than a
  dark screen when idle. Source: the existing `getBotStatus()` (`running`, `lastRun`,
  `novelsUpdated`, `novelsChecked`, `nextRun`) — e.g. "142 novels · checked 87 · 3 new chapters
  found · next scan in 4h." No new backend signal needed for this state either.

**Why it's worth building.** Checked against all 6 competitors surveyed in the field audit
(Kavita, StoryGraph, Hardcover, Mihon, KOReader/KOSync, NovelUpdates) — none have anything like
it. Closest real analogs are all from adjacent domains (music/media-server Now Playing views,
smart-display ambient mode, OS-level "currently reading" widgets in BookFusion/BookMaster/Book
Track — but those are single-device home-screen widgets, not a live cross-device second screen).
Proven UX patterns, borrowed into a niche nobody else has brought them to.

**Technical foundation already exists — this is close to a frontend-only build.**
`src/websocket/handlers.ts` puts every authenticated socket into a `user:${userId}` room the
moment it connects (`socket.join(room)`); `src/routes/progress.ts` already
`io.to(`user:${user_id}`).emit('progress:updated', ...)` on every accepted sync. A companion
page just needs to open a socket connection (reusing the existing session login — no QR pairing,
no new auth) and render whatever arrives. No new endpoint required for the live data path;
`getBotStatus()` already exists for the idle-state data.

**Open decisions — pick these up first:**
1. **Reading-state stats, beyond cover/title/chapter/percent.** Two directions on the table:
   - *Session-focused* — time spent this session, chapters read today, current streak
     (`computeStreaks`). Numbers that change while you watch; feels alive.
   - *Book-identity-focused* — genre tags, author, overall position (Ch. 102 of 2645). Static,
     calmer, more "book jacket" than "live dashboard."
2. **What triggers the reading → idle switch?**
   - *Timeout since last sync* (~5 min with no `progress:updated`) — pure frontend, no backend
     change, just a guess at "stopped reading."
   - *Explicit signal* — userscript emits on `beforeunload`/`visibilitychange`
     (`io.emit('reading:ended')` or similar) so the switch is immediate and deliberate, not
     timing-guessed. New backend + userscript wiring, more precise.

Recommended defaults going in (not yet confirmed with the user): session-focused stats, timeout-
based idle trigger — both are the zero-new-backend options, so if the goal is a fast first build,
start there and upgrade to the explicit-signal / book-identity variants later if the timeout
guess feels wrong in practice.

---

## Explorer grid — hover overlay, three candidates

Shipped for now: a delayed card lift (`.card-lift`, 200ms hover intent, `translateY(-4px)`).
Deliberately minimal. Any of these three can replace it later — they were considered
together, so the notes are kept together.

**A · Quick-action overlay.** Hover dims the cover and reveals per-novel actions:
Continue Reading, a status dropdown, a favourite toggle — My List's controls without
leaving Explorer. The most useful of the three: Explorer is where all 131 titles are
browsed, so setting status or resuming without a round-trip to the novel page is the
real saving. **Cost:** the card is currently one `<Link>` wrapping everything, and
buttons cannot nest inside a link — it has to be restructured so the cover is the link
and the actions are siblings. That refactor is correct regardless of this feature.

**B · Info peek overlay.** Hover reveals read-only detail over the cover: progress bar,
chapters behind, last-read date, status badge. No buttons, so the card stays a single
clean link and no restructuring is needed. Makes the grid far more scannable, but you
still click through to *do* anything.

**C · Multi-select for bulk actions.** Hover shows a checkbox; ticking several covers
raises a bar to set status, favourite, or remove in one go. Genuinely powerful at 131
novels — but the largest build of the three, and it overlaps the Manage page's remit.
Worth it only if bulk editing becomes a real need.

**If picking one:** A. It's the only one that reduces clicks on the page where the most
browsing happens, and it forces the card restructure that B and C would each want later
anyway.

---

*Not a todo app. A real system with real engineering.*
