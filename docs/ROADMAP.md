# Roadmap

Open and accepted-but-unbuilt work only. Completed work, full brainstorm
lists, and the full decision trail (including everything declined and why)
live in [`docs/changelog/2026-08-level-up.md`](./changelog/2026-08-level-up.md) —
this file is the trimmed, current-facing view of it.

> Two items below were corrected against the current codebase while writing
> this file (see notes inline) — the source document was accurate when
> written but predates work that has since shipped.

## Ops & infrastructure

- [ ] **Wire up real WebSocket updates in the SPA.** Discovered 2026-08-07:
      the backend emits `progress:updated` over Socket.IO on every accepted
      sync, but the frontend has never consumed it — `socket.io-client`
      isn't even a dependency. Dashboard/Explorer/Manage/My List currently
      poll `/api/v1/novels` instead (60s / 60s / 60s / 3min) as a cheaper
      fix for stale "Continue Reading" data. Replacing the poll with a real
      socket listener would make updates instant and cut the polling
      requests, at the cost of adding connection lifecycle + auth (the
      `api_key` handshake `src/websocket/auth.ts` already expects) to the
      frontend. Considered and deferred in favor of polling on 2026-08-07 —
      revisit if 60s isn't fresh enough in practice, or when the
      second-screen companion idea below gets built (it needs this anyway).
- [ ] **Rotate off the legacy anon key.** Don't rotate the JWT secret — it
      invalidates `service_role` too, which Storage depends on. Migrate to
      publishable/secret keys: create a secret key → update
      `SUPABASE_SERVICE_KEY` on Render → verify covers + backups → then
      deactivate legacy. Both systems run in parallel, so no downtime
      window.
- [ ] **Delete the dead `SUPABASE_KEY` export** (`config.ts`) — falls back
      from service key to anon key and is never read. Harmless now, a trap
      once legacy keys are deactivated.
- [ ] **`realChapterCount` module cache** (`ChapterDetector.ts`) is never
      reset per novel. Can no longer override a larger value, and Refresh
      All is immune (fresh tab per novel), but browsing several novels in
      one tab can still surface a stale count.
- [ ] **`extractChapterNum` caps at < 10000** — silently drops novels past
      10k chapters. Not hit today (max is ~7,600).
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

## Product features — Tier 1: deferred specs (infra already exists)

All new UI goes in `frontend/`. Build order: F12 → F11 → F13 → F14 per the
original doc, though F12/F13 were declined (see changelog) — F11 and F14
are the two still accepted.

- [ ] **F11 — Full stats page** (`/app/stats`). `GET /api/v1/stats/summary`
      and `/stats/daily` already exist; needs one new `/stats/breakdown`
      endpoint (busiest hour, per-device split, weekday) plus
      `frontend/src/pages/Stats.tsx`.
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
- [ ] Reading analytics engine (completion ETA, velocity, peak hours, burnout detection)

## Product features — Tier 3: signature

- [ ] Reading Time Machine (scrubable animated timeline of the whole library)
- [ ] Ghost positions (faint markers showing where other devices left off)
- [ ] Live reading indicator (Socket.IO is already in place)

## Product features — Tier 4: power-user (full specs in `future_ideas.md` §9–17)

- [ ] Dead novel detection & auto-triage
- [ ] Unified search across notes, bookmarks, novels, tags
- [ ] Theme engine & custom accent colours
- [ ] Batch import from URLs
- [ ] Chapter highlights & annotations, userscript-side
- [ ] Auto-cleanup & maintenance mode
- [ ] Userscript reading modes

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
