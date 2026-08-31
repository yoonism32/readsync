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
- [ ] **`realChapterCount` module cache** (`ChapterDetector.ts`) is never
      reset per novel. Can no longer override a larger value, and Refresh
      All is immune (fresh tab per novel), but browsing several novels in
      one tab can still surface a stale count.
- [x] **`extractChapterNum` caps at < 10000** — Done 2026-08-15. All 6
      chapter-number sanity-check sites in `ChapterDetector.ts`
      (`extractChapterNum`, `extractChapterFromUrl`,
      `getCurrentChapterFromContent`, `parseChapterEnhanced`) now use a
      shared `MAX_CHAPTER_NUM = 100000` constant (`config.ts`) instead of
      the hardcoded `10000`. `extractHeaderChapterCount`'s separate
      document-count check (already `< 100000`, a different concept) is
      untouched.
- [ ] **`tab.closed` counts as success** (`useRefreshAll.ts`) — any
      external close is banked as a win with no scrape. Deliberately left;
      a test documents the behaviour if you want to flip it.
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
- [ ] **`validateEnvironment()` (`src/config.ts:108`) is never called.**
      Flagged by a 2026-08-31 production-readiness pass. A missing
      `SESSION_SECRET` (or other required var) currently starts the server
      with an empty/undefined signing secret instead of failing fast — the
      check exists but nothing invokes it from `server.ts`. Wire it into
      startup so a misconfigured deploy fails loudly instead of silently.
- [ ] **No documented rollback path for a failed migration.** Migrations
      run automatically and forward-only on startup (`src/db/migrate.ts`);
      there's no written procedure for unsticking a partially-applied one.
      Worth a short paragraph in [DATABASE.md](./DATABASE.md), not new code.
- [ ] **No error-reporting/alerting beyond stdout logs.** Generalizes the
      "no egress alarm short of a human staring at the dashboard" gap
      (08-18 incident above) to all runtime errors — nothing pages or
      surfaces an exception outside of Render's log tail. A lightweight
      option (Sentry free tier, or a webhook-based log alert) would close
      this without new infra.

## Accessibility (2026-08-31 audit)

- [ ] **Unlabeled, placeholder-only form inputs** — Manage's filter input,
      NotesPanel (2 fields), TagEditor, and the Settings API-key field have
      no `<label>`/`aria-label`; a screen reader announces nothing when
      they're focused. WCAG 1.3.1/4.1.2.
- [ ] **`CommandPalette` is missing `aria-modal` and has an incomplete Tab
      trap** — focus can leave the visible dialog while it's open.
- [ ] **No live-region announcement for socket-driven updates** — SPA
      state updates silently on `progress:updated`/`chapters:updated` (see
      [ARCHITECTURE.md](./ARCHITECTURE.md#data-flow-reading-progress-sync));
      a screen-reader user gets no signal that the page changed under them.
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
      output at once.

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
      exists. **Scope caveat:** production progress history is thin before
      December 2025 (DB was wiped for space in late 2025) — scope the first
      one to a recent window (3–6 months), not a full calendar year.

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
- [ ] **"On this day" flashback** — surfaces what you were reading N
      months/years ago, from existing snapshot timestamps.
- [ ] **In-library rating-based recommendations** — "loved this, try these"
      using the half-star `rating` (migration 011) plus `novel_categories`
      tags already in the schema; no external API.
- [ ] **Reading-activity digest** — optional periodic summary of new
      chapters/progress, reusing the existing `notifications` generation
      logic. Distinct from the "weekly data-health digest" below, which
      covers corrections/rejected regressions, not user-facing reading
      content.

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
