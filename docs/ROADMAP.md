# Roadmap

Open and accepted-but-unbuilt work only. Completed work, full brainstorm
lists, and the full decision trail (including everything declined and why)
live in [`docs/changelog/2026-08-level-up.md`](./changelog/2026-08-level-up.md) —
this file is the trimmed, current-facing view of it.

> Two items below were corrected against the current codebase while writing
> this file (see notes inline) — the source document was accurate when
> written but predates work that has since shipped.

## Ops & infrastructure

- [x] **Switch the DB pool to Supabase's transaction-mode pooler.** Done
      2026-08-17.
      2026-08-11 incident: a production deploy crashed on startup with
      `EMAXCONNSESSION` — `DATABASE_URL` goes through the session-mode
      pooler (port 5432), capped at 15 concurrent clients project-wide,
      several of which are permanently held by Supabase-internal processes
      (`pg_cron`, `postgres_exporter`, PostgREST, Storage). `PG_POOL_MAX`
      defaulted to 20 — this app alone could request more connections than
      the pooler could ever grant it, independent of any external load.
      Immediate mitigation shipped same day: `PG_POOL_MAX` default lowered
      to 10 (`src/config.ts`). The real fix is switching to the
      transaction-mode pooler (port 6543), which hands out a physical
      connection per-transaction instead of per-client-lifetime — matches
      this app's actual usage (`withTransaction`, `pool.query()` one-shots)
      and doesn't have the same low hard cap. Needs deliberate testing
      before flipping: transaction mode doesn't support session-scoped
      features (prepared statements across calls, `SET` persisting outside
      a transaction, session-level `LISTEN`) — audit `src/` for anything
      that assumes connection affinity across separate `pool.query()` calls
      before switching.
      **Code audit complete (2026-08-15), no blockers found:** no
      `LISTEN`/`NOTIFY`, no advisory locks, no `CREATE TEMP TABLE`, no
      manual `PREPARE`/`EXECUTE`. All 9 direct `pool.connect()` checkouts
      are correctly scoped — either the shared `withTransaction()` helper
      (`src/db/pool.ts`) or a single client held for one logical unit of
      work and released in a `finally`. `DATABASE_URL`/`PG_POOL_MAX` are
      env vars (`src/config.ts`), not hardcoded, so the actual switch is a
      deployment-config change (port 5432 → 6543), not a code change.
      `.env` and the Render `DATABASE_URL` env var both flipped to the
      transaction-pooler port (`aws-1-eu-west-2.pooler.supabase.com:6543`,
      same host/user as the session pooler — Supavisor exposes both modes
      on one host, only the port differs). Connectivity verified locally
      via a direct `pg` client connection (Postgres 17.6, query succeeded)
      before the Render change; Render redeployed on env var save.
      `PG_POOL_MAX` deliberately left at 10 rather than raised — that value
      was already proven safe under the *more* restrictive session-pooler
      cap, so it only gains headroom under transaction mode, never loses
      it. Raising it is a separate, lower-risk follow-up once prod has run
      stable for a while, not something this switch required.
      Rollback, if ever needed: revert the port back to `:5432` on Render.
- [x] **Wire up real WebSocket updates in the SPA.** Done 2026-08-13.
      Discovered 2026-08-07: the backend emitted `progress:updated` over
      Socket.IO on every accepted sync, but the frontend never consumed it.
      Fixed by adding a second emit, `chapters:updated`, to
      `POST /api/v1/admin/novels/auto-update` (`src/routes/admin.ts`,
      converted to a router factory taking `io`, mirroring
      `createProgressRouter(io)`), and wiring the frontend to consume both:
      `frontend/src/hooks/useSocket.ts` opens one connection per
      authenticated tab (reusing the same `api_key` as HTTP auth), and
      `frontend/src/components/Layout.tsx` subscribes both events to
      `mutate('/novels')`, invalidation-only — SWR remains the single
      source of truth. Dashboard/Explorer/Manage/My List keep a poll as a
      fallback for a silently-dead socket, but it's now 30 minutes instead
      of the primary path. See [ARCHITECTURE.md](./ARCHITECTURE.md#data-flow-reading-progress-sync)
      for the full data flow. The second-screen companion idea below can
      now build directly on this rather than needing to add socket wiring
      itself.
- [ ] **2026-08-12 incident: Supabase Fair Use Policy warning (free-tier
      egress).** Four independent causes, all mitigated same day, none of
      them real usage growth:
      1. Cover uploads (`src/routes/covers.ts`) had no `cacheControl`, so
         Storage's 1-hour default applied to immutable, slug-addressed
         JPEGs served via 302-redirect to every reader's `<img>` tag —
         fixed with `cacheControl: '31536000'`.
      2. The userscript's cross-device conflict checker
         (`ProgressSync.ts`) polled `/api/v1/compare` every 2s forever,
         including in backgrounded tabs (no Page Visibility guard) — fixed:
         20s interval, skipped while hidden, immediate check on refocus.
      3. Dashboard/Explorer/Manage polled `/api/v1/novels` every 60s
         (shipped 2026-08-07 for the stale-data fix above) — bumped to
         3min, matching My List's already-safe cadence.
      Mitigated at the time, and #3's real fix — the WebSocket item above —
      shipped 2026-08-13, so polling is now a 30-minute fallback rather than
      the primary path; #1/#2 are structurally sound. Verify no repeat
      warning after a full billing cycle (next check: ~2026-09-11).
- [ ] **2026-08-18 incident: egress back at 9GB/5GB six days after the
      08-12 "fixed same day" — the billing-cycle-verify plan has now been
      falsified twice.** `pg_stat_statements` (14-day window, since 08-04)
      showed the app's direct Postgres traffic via Supavisor — not
      Storage/REST — as dominant: `getLatestStates()` in
      `NovelService.ts` (backing `POST/GET /api/v1/progress` and
      `GET /api/v1/compare`) was called ~689k times each for two queries,
      and `GET /api/v1/novels`'s `latest_activity` query was called 32,931
      times returning 4.54M total rows. Root cause: `progress:updated`
      (emitted on every progress sync, i.e. every scroll-throttled ping)
      triggered `mutate('/novels')` in `Layout.tsx` — a full re-run of the
      expensive per-novel-list query on every single sync ping, not just on
      reconnects as first suspected. Fixed same day: (1) `getLatestStates()`
      now selects explicit columns instead of `p.*`/`d.*` — `id`, `user_id`,
      `novel_id`, `chapter_slug_extra`, `seconds_on_page`,
      `read_through_num`, and the never-consumed `device_last_seen` were
      going over the wire on every one of those ~1.4M calls for nothing; (2)
      the `progress:updated` → `mutate('/novels')` refresh in `Layout.tsx`
      is now debounced 5s so a burst of pings from one reading session
      collapses into one revalidation. `pg_stat_statements` reset
      2026-08-18 for a clean sample. The 08-16 Storage cache-control
      backfill's live-verification failure (still showing `no-cache` after
      the fix) remains unresolved and separate from this. Verify call
      volume actually dropped before trusting another "fixed" — this
      project still has no egress alarm short of a human staring at the
      dashboard, which is the real gap across all three incidents.
      **Verified 2026-09-04 — mixed, and it found a fourth cause.**
      `pg_stat_statements` reset 2026-08-18 18:13 UTC; sampled at 16.92
      days vs. the baseline's 14, so the figures below are normalised
      per-day.
      - `getLatestStates()`'s two queries: ~689k calls each (49,214/day)
        → 160,722 each (9,499/day). **−81%.** The explicit-columns and
        debounce fixes worked, and this was the largest single source.
      - `GET /api/v1/novels`'s `latest_activity` CTE: 32,931 calls /
        4.54M rows (2,352/day) → 34,327 calls / 4.84M rows (2,029/day).
        **−14%** — essentially flat, and still 4.8M rows and ~44 minutes
        of DB time per sample. The `progress:updated` → in-place
        `applyProgressPatch` rewrite in `Layout.tsx` removed the burst
        path, so what remains looks like baseline load rather than sync
        pings. Still open.
      - **New, never previously identified:** `GET /api/v1/notifications`
        was the *highest-call-count query in the database* — 68,070 calls
        (4,023/day, roughly one every 21s) returning 3,403,500 rows.
        Cause: `NotificationBell` mounts in `Layout.tsx`, so it renders on
        every page in every open tab, and it polled the full 50-row list
        (with its `LEFT JOIN novels`) every 60s purely to draw an
        unread-count badge. Same shape as the 08-12 incident's userscript
        `/compare` poll — a cheap-looking interval fetching an expensive
        payload. Fixed 2026-09-04: a new
        `GET /api/v1/notifications/unread-count` runs the bare `COUNT` for
        the badge, and the list is fetched only while the panel is open
        (`src/routes/notifications.ts`,
        `frontend/src/components/NotificationBell.tsx`; regression test
        `frontend/src/components/NotificationBell.test.tsx`). Should
        remove ~3.4M rows per 17-day sample.
      Lesson for the next check: all three prior write-ups hunted
      `/novels` and `getLatestStates()` because those were the known
      suspects, and none of them ordered `pg_stat_statements` by `calls`
      across the whole table — which is how a top-two source sat unnoticed
      through three investigations. Do that first next time.
- [x] **2026-08-12 incident: chapter-count corruption via nav-link
      false-positive.** Done 2026-08-15. `extractLatestChapterInfo()` had no
      way to tell a chapter page's "Next Chapter" nav link (current + 1)
      apart from a real latest-chapter signal; its network fallback to the
      novel's main page was gated behind a flat `maxChapter < 500`, so any
      novel past chapter 500 skipped it. The same wrong nav-derived number
      then repeated on every scroll-sync, and the server's "same wrong
      number twice = trust it" self-healing correction (built for a
      different bug class, `ChapterCorrection.ts`) confirmed it and
      overwrote a correct stored value. Hit one novel in production
      (`eternal-life-by-daily-divination`, 669 → 656); corrected via direct
      SQL. First fix: the fallback now also fires when the local candidate
      isn't meaningfully ahead of the chapter being read
      (`CHAPTER_PAGE_NAV_LOOKAHEAD = 5`, `config.ts`) — closes the exact
      "Next Chapter" repro.
      **Structural fix (closes the residual risk flagged in code review):**
      the gap was that `ChapterCorrection.ts` trusted any locally-derived
      number once it repeated twice, and a deterministic scraper bug
      reproduces the same wrong number every time — repetition alone was
      never proof of correctness, only proof of non-randomness.
      `extractLatestChapterInfo()` now returns a `verified` flag, true only
      when the winning candidate is corroborated by an authoritative signal
      (a titled meta/`.l-chapter` name, the header count, or a confirmed
      main-page fetch) rather than the generic any-link-containing-"chapter"
      scan alone. `ChapterCorrection.ts` trusts a verified regression on the
      first sighting; unverified regressions still require the original
      two-sighting rule as a fallback. See `ChapterCorrection.ts`,
      `ChapterDetector.ts`, and `__tests__/regression/chapterCorrection.test.ts`.
      **Historical audit (2026-08-15):** checked all 136 novels (115 past
      the vulnerable 500-chapter threshold) against 79,610 progress
      snapshots for two corruption signatures — a nav-link-style stored
      title (`%next chapter%` / `%next%` / empty) and `latest_chapter_num`
      landing exactly one past a real reader's synced chapter ≥499. Zero
      matches. `eternal-life-by-daily-divination` is the only novel that was
      ever hit, and it's already corrected (now `676`, a real titled
      chapter).
- [x] **`realChapterCount` module cache** (`ChapterDetector.ts`) is never
      reset per novel — Done 2026-09-01. Was a single module-level variable
      shared across every novel a tab visited; browsing several novels in
      one tab (no full reload) could leak one novel's fetched count into
      another's candidates. Replaced with `realChapterCountBySlug`, a cache
      keyed by novel slug (`getCachedRealChapterCount`/
      `setCachedRealChapterCount`), so each novel's count stays isolated.
      Regression test:
      `userscript/__tests__/realChapterCountCache.test.ts`.
- [x] **`extractChapterNum` caps at < 10000** — Done 2026-08-15. All 6
      chapter-number sanity-check sites in `ChapterDetector.ts`
      (`extractChapterNum`, `extractChapterFromUrl`,
      `getCurrentChapterFromContent`, `parseChapterEnhanced`) now use a
      shared `MAX_CHAPTER_NUM = 100000` constant (`config.ts`) instead of
      the hardcoded `10000`. `extractHeaderChapterCount`'s separate
      document-count check (already `< 100000`, a different concept) is
      untouched.
- [ ] **API documentation (OpenAPI/Swagger)** for the endpoints in
      [API_REFERENCE.md](./API_REFERENCE.md).
- [x] ~~**`SubPlan 2` in the My List query**~~ — **corrected: already
      done.** The source doc listed this as open (LATERAL rewrite needed),
      but migration `010_device_latest_and_fk_indexes.sql` shipped exactly
      that fix — see [DATABASE.md](./DATABASE.md). 2667ms → 36ms, verified.
- [x] ~~**7 unindexed foreign keys**~~ — **corrected: already done.** Same
      migration 010 adds all 7 `novel_id` indexes named in the source doc.
- [~] **Bot admin panel** — **corrected: the shape of "open" changed.** The
      source doc framed this as "still legacy-only, never ported to the
      React SPA." As of this audit, the legacy app is deleted, and the
      React SPA's own bot-trigger panel (which existed but silently no-op'd
      in production) has been removed rather than fixed, because the bot is
      staying intentionally off — see
      [ARCHITECTURE.md](./ARCHITECTURE.md#the-bot-is-intentionally-off-in-production).
      Not open work unless the decision to keep the bot off is revisited.
- [ ] **Raw API explorer** — an in-app view for hitting `/api/v1/*` routes
      manually. Genuinely still unbuilt (the source doc's "legacy-only"
      framing no longer applies since legacy is deleted, but nothing was
      ever built for the current stack either).
- [x] **`validateEnvironment()` (`src/config.ts:108`) is never called.** —
      Done 2026-09-01. `server.ts`'s `main()` now calls it as its first
      statement, before `runMigrations()` — a missing `SESSION_SECRET`/
      `DATABASE_URL` now fails startup loudly instead of running with an
      empty signing secret.
- [x] **No documented rollback path for a failed migration.** — Done
      2026-09-01. Added a "Recovering from a failed migration" section to
      [DATABASE.md](./DATABASE.md) covering the transactional-vs-
      `CONCURRENTLY` failure modes and the manual `schema_migrations` retry
      procedure.
- [x] **No error-reporting/alerting beyond stdout logs.** Done 2026-09-04.
      Generalized the "no egress alarm short of a human staring at the
      dashboard" gap (08-18 incident above) to all runtime errors — nothing
      paged or surfaced an exception outside of Render's log tail.
      Closed with a webhook rather than an SDK: every error in the app
      already funnels through `handleDbError` and `globalErrorHandler`
      (`src/middleware/errorHandler.ts`), so `src/services/Alerter.ts`
      only needed to hook those two plus process-level
      `unhandledRejection`/`uncaughtException` in `server.ts`. Node's
      global `fetch` — **no new dependency**. Alerts are deduped by
      fingerprint (error name + message + first stack frame) with a 15-min
      cooldown, and capped at 20/hour overall, because a bad deploy can
      throw a *distinct* error per request that the per-error cooldown
      alone would not hold down. `ALERT_WEBHOOK_URL` is optional and
      deliberately absent from `validateEnvironment()`'s required list;
      unset disables alerting and warns at startup. Delivery verified
      end-to-end against a local receiver. Tests:
      `__tests__/regression/alerter.test.ts` (7).
      **Scope limit, stated plainly:** this alarms on *runtime errors*,
      not on egress volume — egress has no exception to catch, it is a
      Supabase usage metric. The 2026-09-04 verification above is still a
      manual check; a real egress alarm would need Supabase's usage API
      and is not closed by this.

## Accessibility (2026-08-31 audit)

- [x] **Unlabeled, placeholder-only form inputs** — Done 2026-09-01. Added
      `aria-label` to Manage's filter input, NotesPanel's 2 chapter fields,
      TagEditor's tag input, and the Settings API-key field. WCAG 1.3.1/4.1.2.
- [x] **`CommandPalette` is missing `aria-modal` and has an incomplete Tab
      trap** — Done 2026-09-01. Added `aria-modal="true"` to the dialog and
      a real Tab/Shift+Tab trap (`trapFocus` in `CommandPalette.tsx`) that
      cycles focus among the dialog's own focusable elements instead of
      letting it escape to the page behind the overlay.
- [x] **No live-region announcement for socket-driven updates** — Done
      2026-09-04. SPA state updated silently on
      `progress:updated`/`chapters:updated` (see
      [ARCHITECTURE.md](./ARCHITECTURE.md#data-flow-reading-progress-sync));
      a screen-reader user got no signal that the page changed under them.
      Added an `aria-live="polite"` region in `Layout.tsx`, fed from the two
      socket handlers already there. **Rate-limited to one announcement per
      30s**, which is the whole design of the item: `progress:updated` fires
      on every scroll-throttled sync ping, so an unthrottled region would
      read out continuously for a whole reading session. The region is also
      cleared before each new message, since assistive tech announces on text
      *change* and setting the same string twice would be silent. Tests:
      `frontend/src/components/Layout.test.tsx` (4), which required stubbing
      `ResizeObserver` in `frontend/src/test/setup.ts` — jsdom has none, and
      its absence had also been failing `Login.test.tsx` on main.
      Related to, but distinct from, the userscript-side "ARIA live-region
      sync announcements" already listed under accepted field-audit ideas
      below — that one covers the injected overlay on the source site, not
      the ReadSync SPA itself.

## Dependency maintenance

- [x] **`@sparticuz/chromium` (bot's Puppeteer dep) bumped to latest.** Done
      2026-08-31 — `^143.0.4` → `^149.0.0` (no published CVE against the
      old pin, just version lag; the bot stays off in production regardless,
      see [ARCHITECTURE.md](./ARCHITECTURE.md#the-bot-is-intentionally-off-in-production)).
      `bot/` still compiles clean (`tsc -p bot/tsconfig.json`) and the full
      suite (38 files, 283 tests) stays green.
- [ ] **TypeScript 6→7 and ESLint 9→10 major-version bumps deferred.** No
      urgency; revisit together since both tend to touch config/type-check
      output at once. Stepped the safe part in the meantime (2026-09-01):
      `typescript` 6.0.2→6.0.3 and `typescript-eslint` 8.58.0→8.69.0
      (`eslint` was already at its latest 9.x, 9.39.5) across root,
      `frontend/`, and `userscript/` — lint and the full test suite stayed
      green. When the major bump is eventually attempted, take the same
      incremental approach: step through intermediate minors before
      jumping majors, rather than both majors at once.

## Future site support

- [ ] **Add wtr-lab.com as a supported site.** Motivation: has novels not
      available on NovelBin/NovelArrow (community-requested AI machine
      translations, mostly Chinese web novels). Not started — this is
      research only, from a 2026-08-15 feasibility spike (LLM council +
      hands-on browser inspection). **Blocked on all three of:**
      1. **Architecture prerequisite.** There is no site-adapter
         abstraction today — all site-specific logic (URL regex, DOM
         selectors, meta-tag parsing, base-URL derivation) is hand-branched
         directly inside `ChapterDetector.ts` (~545 lines, after page-metadata
         extraction split it down from ~630 — see `PageMetadata.ts`) and
         hand-mirrored
         in a second, simpler scraper (`bot/src/services/NovelScraper.ts` /
         `parseNovelInfo.ts`) that can't share code with it (different build
         systems). Two sites already broke this twice (2026-08-06 header-count
         corruption, 2026-08-12 nav-link corruption) despite NovelArrow being
         essentially a clone of NovelBin's URL/DOM conventions. wtr-lab shares
         none of those conventions. A third site should not be hand-branched
         into the same file — extract a real adapter interface first.
      2. **Data-model conflict, not just new detection logic.** Confirmed via
         browser spike: wtr-lab gates chapters behind an AI-translation
         "unlock" system independent of raw chapter count (e.g. a 656-chapter
         novel showing "AI-UNLOCK PROGRESS 50/656 — 606 chapters locked").
         Navigating directly to a locked chapter URL (`chapter-656` on that
         novel) does **not** 404 — it silently SPA-redirects back to the
         novel's overview page. Unlocking is a per-reader, payment-gated
         action, not a fixed novel-level property. ReadSync's entire model
         assumes one novel-level "latest chapter" (`novels.latest_chapter_num`)
         that's the same for every reader and always the next thing to read —
         that assumption is false on wtr-lab. Also confirmed a second,
         separate numbering hazard already familiar from NovelArrow's dual-
         numbered titles: the TOC lists chapters as `#656` (sequential/URL
         index) vs. `660` (raw source chapter number) — the two diverge.
         There is no `og:novel:*`-style meta tag (or equivalent) at all on
         wtr-lab, so the single most-trusted signal in the current detection
         logic (`namedNum` / Strategy 0) has nothing to key off; detection
         would need to be designed from scratch, not adapted. "Next"/"Prev"
         are `<button>`s wired to client-side routing, not `<a href>` links,
         so the existing nav-link-href heuristic (the one responsible for the
         2026-08-12 incident) has nothing to read here either.
      3. **ToS / robots.txt conflict for any automated polling.** wtr-lab's
         `robots.txt` explicitly disallows crawling `/*/novel/*/chapter-*`
         and `/api*`. Its Terms of Use (v1.0, §2.2 Acceptable Use Policy)
         explicitly prohibits using "software or automated agents or scripts
         to... generate automated searches, requests, or queries to the
         Site." This lands most directly on the server-side bot verification
         scraper (periodic background `fetch()` calls from Node, not a human
         browsing) and is murkier but not clearly safe for the userscript's
         own background polling (e.g. the 20s cross-device conflict check,
         the main-page latest-chapter fetch fallback) — both look like
         "automated... requests" even though they originate from a real
         logged-in user's browser session. Not evaluated by a lawyer; treat
         as a real blocker to resolve (e.g. read-only manual chapter entry
         with no background fetches) before writing any detection code, not
         just an engineering risk.
      **Not a blocker, contrary to initial assumption:** a bare `fetch()` to
      `https://wtr-lab.com/` returns HTTP 403 (bot-detection on non-browser
      requests), but every page loads normally through actual browser
      navigation — home, novel list (`/en/novel-list`), novel page
      (`/en/novel/<id>/<slug>`), and an unlocked chapter (`/chapter-1`) all
      rendered cleanly with no challenge/CAPTCHA. The userscript's real
      browser context is not blocked; only bare server-side fetches are.
      URL scheme (`/en/novel/<id>/<slug>/chapter-<N>`, numeric novel ID) is
      simpler than NovelArrow's (no required title-slug on the chapter URL
      itself), and the reader's `Ch. N / Total` display is a cleaner signal
      than NovelArrow's ambiguous header-count text — so once the three
      blockers above are resolved, the actual detection code may be less
      work than NovelArrow was.
      **Recommendation (LLM council + spike, 2026-08-15):** don't build yet.
      If revisited: resolve the ToS question first (item 3) since it may
      rule out automated polling entirely regardless of architecture; then
      decide whether ReadSync's data model can represent a per-reader
      unlock-gated "latest chapter" before extracting the adapter interface
      that would make a third site addition safe.

## Novel metadata

- [x] **Store and display NovelArrow synopses on the ReadSync novel page.**
      Done 2026-08-26 — shipped exactly as specced. Imported once per novel
      (not a live embed/per-page-load fetch) into `novels.synopsis` /
      `synopsis_imported_at` (migration `013_novel_synopsis.sql`), parsed
      from the visible **Synopsis** section rather than the truncated
      `og:description`; Refresh All and the metadata scan never overwrite a
      populated value. Rendered via a `SynopsisPanel` in
      `frontend/src/pages/Novel.tsx`, sourced from a dedicated
      `synopsis-${novelId}` endpoint (not added to the list-backing
      `GET /api/v1/novels`, matching the egress-incident constraint above).
      Regression coverage: `__tests__/regression/novelSynopsis.test.ts`,
      `pageMetadata.test.ts`, `novelParsing.test.ts`,
      `frontend/src/pages/Novel.test.tsx`. Commits `f72b549`, `e38cc50`,
      `1811e18`.

## Product features — Tier 1: deferred specs (infra already exists)

All new UI goes in `frontend/`. Build order: F12 → F11 → F13 → F14 per the
original doc, though F12/F13 were declined (see changelog) — F14 is the
one still open (F11 shipped 2026-08-11).

- [ ] **F14 — Reading Wrapped.** Ship in December. `computeStreaks` already
      exists. **Scope caveat — corrected 2026-09-04, the original reason was
      wrong.** This said history was thin before December 2025 "because the DB
      was wiped for space in late 2025."
      **Snapshots *were* deleted — but not in that period.** `progress_snapshots`
      runs from `id` 1 to 139,851 with 139,065 rows surviving: 786 missing ids
      across 28 gap sites. Split by era, **785 of those 786 are in 2026; the
      Aug–Dec 2025 range is missing exactly one id.** Ids 1–5, 6–29, 59–113 and
      114–420 are fully contiguous, so nothing was removed from the thin months.
      The single 709-id gap on 2026-01-26 is almost certainly **one deleted
      novel**, cascade-removed via `progress_snapshots.novel_id REFERENCES
      novels ON DELETE CASCADE`. Reading in that era was one novel at a time in
      dense bursts — the rows either side are `this-human-immortal-is-too-serious`
      (102 rows / 3 chapters / 6m35s) and `country-weapon` (139 rows / 6
      chapters / 6m36s) — and the hole spans 14:23→16:13, i.e. ~110 minutes at
      the ~4s ping cadence, which is the exact shape of one novel's continuous
      session. The remaining 27 gaps (12 of exactly 1 id, 15 of 2–20) look like
      ordinary failed inserts.
      So deletion is real but irrelevant here. The real reason the early months
      are thin is that the app barely wrote snapshots then: Aug 2025 = 5, Sep = 24, Oct = 28, Nov = 55, Dec = 307,
      then Jan 2026 = 32,955 — a 100x jump when scroll-throttled per-ping
      syncing started producing rows at volume. Ids are contiguous across
      every month boundary, so the gap months (**March and June 2026 have zero
      snapshots**) are periods where nothing synced at all, not periods that
      were cleaned out.
      The scoping advice still stands, but for a different reason: usable
      density starts January 2026, and 2026 has two dead months in it. Scope
      the first Wrapped to a recent window and state the covered range in the
      UI rather than implying a full year.

## Product features — Tier 2: technically impressive

- [ ] Offline-first PWA (service worker, IndexedDB, background sync queue)
- [ ] Chrome Extension (Manifest V3), graduating from the userscript
- [ ] CLI tool (`readsync status|list|progress|sync|export`)
- [ ] GraphQL API alongside REST
- [ ] CRDTs for conflict resolution (replace last-write-wins with Automerge/Yjs)
- [ ] Reading analytics engine — remaining scope: completion ETA, peak
      hours, burnout detection.
      - [x] Velocity trend — done 2026-08-31.
            `computeVelocityTrend()` (`src/services/StatsVelocity.ts`)
            splits a 14-day chapters-read series into two trailing 7-day
            windows and reports the percent change; `GET /api/v1/stats/velocity`
            (see [API_REFERENCE.md](./API_REFERENCE.md)), rendered in the
            new Bento Grid `frontend/src/pages/Stats.tsx`. Commit `84f2e5b`.

## Product features — Tier 3: signature

- [ ] Reading Time Machine (scrubable animated timeline of the whole library)
- [x] DB-latest reconciliation on chapter load (userscript checks the server's latest snapshot for the current chapter before trusting a cached localStorage scroll position, overwriting it if the server is ahead) — 2026-08-17
- [ ] Live reading indicator (Socket.IO is already in place)

## Product features — Tier 4: power-user (full specs in `future_ideas.md` §9–17)

- [ ] Dead novel detection & auto-triage
- [ ] Unified search across notes, bookmarks, novels, tags
- [ ] Theme engine & custom accent colours
- [ ] Batch import from URLs
- [ ] Chapter highlights & annotations, userscript-side
- [ ] Auto-cleanup & maintenance mode
- [ ] Userscript reading modes

## New feature ideas (2026-08-31 brainstorm)

Not from the field-audit consolidation below — drawn fresh from current
schema/codebase knowledge during the 2026-08-31 docs/roadmap pass. None
scoped or approved yet.

- [ ] **Reading goals** — yearly/monthly chapter-count goal tracked against
      existing `progress_snapshots`; no new infra needed.
- [x] **"On this day" flashback** — Done 2026-09-04.
      `GET /api/v1/stats/on-this-day` anchors on 1/3/6/12/24-month lookbacks
      over `progress_snapshots`, rendered as an "Around This Time" card on the
      Dashboard (`frontend/src/components/OnThisDay.tsx`). No migration.
      **Matched over a ±3 day window, not the exact date** — reading isn't
      daily, and exact-date matching hit only 1 of 4 anchors against real
      production history. The response carries the date actually found so the
      card can say "A year ago" with the real day beneath it rather than
      implying an exact anniversary. The card hides itself when no anchor has
      data (a permanent empty box on the dashboard is worse than no box).
- [ ] **In-library rating-based recommendations** — "loved this, try these"
      using the half-star `rating` (migration 011) plus `novel_categories`
      tags already in the schema; no external API.
- [ ] **Reading-activity digest** — optional periodic summary of new
      chapters/progress, reusing the existing `notifications` generation
      logic. Distinct from the "weekly data-health digest" below, which
      covers corrections/rejected regressions, not user-facing reading
      content.
- [x] **Reading Time by Hour bento upgrades** — Done 2026-09-04, together
      with the "Stats-chart hover copy" item under Misc (they were the same
      request stated twice). `GET /api/v1/stats/breakdown` now takes
      `?window=week`, and returns per-hour novel attribution
      (`by_hour[].novels`, top 3 by time) plus each novel's chapter span for
      that hour. The card gained a right-aligned `This week` chip (defaulting
      to the current week, all-time as the fallback view) and a compact hover
      card replacing the old single-string tooltip: hour and total time as the
      headline, then a chapter range when one novel holds ≥70% of the hour, or
      the novel list with per-novel contributions when it's shared.
      **Known seam:** the time comes from `reading_sessions` and the chapter
      range from `progress_snapshots`, because `reading_sessions` has no
      chapter column — two different clocks (session start vs. snapshot time)
      that can disagree at an hour boundary. Commented at the query. Tests:
      `frontend/src/pages/StatsHourDetail.test.tsx` (6).
      *(original text below)*
      **Reading Time by Hour bento upgrades** — improve the hourly chart card
      with a right-aligned `This week` filter chip in the top-right corner,
      plus a richer hover layer that surfaces the actual reading context
      instead of a single percentage string. Product intent: if an hour has
      multiple novels, show the list of novel names and their contribution;
      if only one novel is active, show the chapter range for that novel
      (e.g. `Ch. 18-42`). Keep the hover copy in a compact card, not a
      purple text line, and treat the filter as a time-window control on the
      card itself (defaulting to the current week while preserving all-hours
      view as a fallback). This should sit alongside the existing stats grid
      and not be treated as a full analytics rewrite yet.

## Shipped off-roadmap (2026-09-04)

Not from any prior list — built on data the schema already stored but nothing
ever queried.

- [x] **Pace fingerprint** — `GET /api/v1/stats/pace`, "Reading Pace" card on
      Stats. Per-novel median seconds-per-chapter against the library median,
      from `progress_snapshots.seconds_on_page`, which was written on every
      sync since day one and read by nothing.
      **Two correctness traps, both handled:** (1) `seconds_on_page` is
      *cumulative* time since page load (userscript `ProgressSync.ts:48`), not
      a per-ping delta — the per-chapter dwell is `MAX` over the pings, never
      `SUM`, which would multiply a chapter's time by its ping count; (2) it's
      wall-clock, so an idle tab inflates it without bound — production holds a
      single **154,757s (43 hour)** reading. Clamped to 5–1800s, which keeps
      129,676 of 139,065 rows (93%). Live values: library median 79s/chapter
      across 46 qualifying novels, fastest 47s (0.59x).
- [x] **Rating vs. behaviour audit** — `GET /api/v1/stats/rating-audit`,
      "Ratings vs. Reading" card. Flags novels rated ≥4.5 with no activity in
      60 days, and ≤2.5 still being read.
      **Reality check that shaped it:** only **2 of 149** novels are rated, so
      both buckets are empty today and the empty state is the *primary* state.
      Rather than ship a permanently blank card, the endpoint also returns the
      most-read unrated novels and the card uses them as a rate-these on-ramp.
- [x] **Per-novel binge sparkline** — "Reading Timeline" card on the novel
      page, from a fifth query added to the existing page-scoped
      `GET /api/v1/stats/novels/:novelId` (not a new endpoint — that route is
      already per-page, so this doesn't repeat the egress-incident mistake).
      One point per chapter's first sighting, not per snapshot. Slope is the
      pace: e.g. *Seeking Fortune* renders 696 chapters over 5 days (139/day).
      Geometry guards both zero-spans, which would emit `NaN` path commands and
      silently blank the SVG (`frontend/src/lib/readingTimeline.test.ts`).

## Accepted from the field-audit consolidation (2026-08-06)

Full reasoning, the 80-item brainstorm lists, and everything declined:
[`docs/changelog/2026-08-level-up.md`](./changelog/2026-08-level-up.md).
These are the ones marked accepted (✅) or accepted-but-unscoped (🟡) that
survived two rounds of review against the actual codebase:

- [ ] **NovelUpdates reading-list bridge** — two-way sync so the two lists don't drift
- [ ] **Time-boxed reading sprints** — opt-in 7-day challenges with a completion badge
- [ ] **Weekly data-health digest** — auto-corrections, cooldown'd mirrors, rejected regressions from the past week, surfaced proactively
- [ ] **Accessible reader overlay** — dyslexia-friendly font/spacing toggle + ARIA live-region sync announcements, injected on the source page
- [ ] **Second-screen companion view** — ambient status display (not a reading surface); design in progress, see below
- [ ] **A "reading personality" page** — paired with F14 Wrapped, built from `progress_snapshots`
- [ ] **Sync conflicts made visible in History** — conditional on shipping a manual resolve action, not a read-only log
- [ ] **Mirror & duplicate detector** — parked, not declined; revisit once the library has enough duplicate-novel forks to matter

### Second-screen companion — design in progress

Reframed from "a reading surface" to "an ambient status display you glance
at, not read from." Two states:

- **Reading state** — a progress sync is actively coming in: cover, title,
  chapter, percent (Spotify Now Playing-style).
- **Idle state** — not blank; shows library/scan status from the existing
  `getBotStatus()` shape (Google Nest Hub Ambient Mode-style).

Technical foundation already exists: `src/websocket/handlers.ts` puts every
authenticated socket into a `user:${userId}` room, and
`src/routes/progress.ts` already emits `progress:updated` on every accepted
sync. This is close to a frontend-only build — a companion page just needs
to open a socket connection (reusing the existing session login) and render
whatever arrives.

**Open decisions, unresolved:**

1. Reading-state stats: session-focused (time this session, streak) vs.
   book-identity-focused (genre, author, position)?
2. Reading → idle trigger: timeout since last sync (~5 min, frontend-only)
   vs. an explicit signal from the userscript (`beforeunload`/
   `visibilitychange`, more precise but needs new wiring)?

Recommended default if picked up: session-focused stats, timeout-based
trigger — both are the zero-new-backend options.

## Explorer grid hover — three candidates, not yet chosen

Shipped for now: a simple delayed card-lift on hover. If revisited:

- **A · Quick-action overlay** — Continue Reading, status dropdown,
  favourite toggle on hover. Most useful, but requires restructuring the
  card (currently one `<Link>` wrapping everything; buttons can't nest
  inside a link).
- **B · Info peek overlay** — read-only detail on hover (progress bar,
  chapters behind, last-read date). No restructuring needed, but you still
  click through to act.
- **C · Multi-select for bulk actions** — checkbox-driven bulk status/
  favourite/remove. Largest build of the three; overlaps the Manage page.

If picking one: A — it's the only one that reduces clicks where the most
browsing happens, and it forces the card restructure B and C would
eventually want too.

## Misc

- [ ] **Close the stale-sync race in `ProgressSync.ts` properly (AbortController
      or generation counter), not just its worst symptom.** 2026-08-18 fix
      (`a8d43f7`) stops a late-arriving `behind_chapter` rejection from
      showing the peek banner on a chapter the reader has since navigated
      past — root cause: the completion sync in `main.ts`'s `onAnyScroll`
      fires immediately and un-debounced, and `cancelPendingSync()` (called
      on every SPA nav) only clears the debounce timer, never an
      already-in-flight request. The shipped fix (`isRejectionStale`) only
      gates the banner. Code review on that fix flagged two things it
      doesn't cover: (1) a stale-but-*successful* late response for the old
      chapter still unconditionally triggers `ctx.updateBadgeStatus`
      ('📡 Synced' / '🔁 Re-read started') — cosmetic badge flicker, not a
      misleading persistent banner, so lower priority; (2) `isRejectionStale`
      only compares chapter numbers, not novel identity — if the reader
      switches to a *different* novel within the same sub-second race window
      and it happens to be on the same chapter number, the check reports
      "not stale" and the banner could misfire attributed to the new novel.
      Both are narrow/low-frequency. The structurally clean fix is threading
      an `AbortSignal` through `api/client.ts`'s fetch call and wiring actual
      cancellation into `initForChapter`/SPA-nav detection (distinguishing
      `AbortError` from real network failures in the existing 4xx-vs-offline
      catch branch) — closes both gaps in one shot, but is meaningfully more
      invasive than the shipped fix. Not blocking; pick up if the badge
      flicker or cross-novel case is ever actually observed.

- [x] **Stats-chart hover copy needs a better information model.** — Done
      2026-09-04; see the "Reading Time by Hour bento upgrades" item above,
      which this duplicated. Original text: User feedback:
      the current hover text is too weak and reads like a single purple line of
      raw metadata rather than useful reading insight. The hover should not be the
      only source of meaning; the chart should present the key reading context at a
      glance, with the hover expanding into a compact detail card. Desired shape:
      show the hour and total time first, then the reading context beneath it: the
      novel names for multi-title hours, or a chapter range when a single novel
      dominates. Keep the value legible and avoid the current “just a percentage”
      or “just a tooltip string” feeling. If this passes design review, pair it
      with the `This week` filter and the richer data view described in the
      hourly-bento roadmap item above.
