# ReadSync execution roadmap

**Prepared:** 15 September 2026; updated 16 September 2026
**Source of truth:** [Roadmap research and next-feature guide](./ideas/2026-09-15-roadmap-research.md)  
**Planning baseline:** `main` at `d92f764`
**Status:** execution in progress; Phase 0, roadmap authoring and Phase 1 are complete locally.
Phase 2 is implemented and passes the local automated suite, with live PostgreSQL DST-boundary
execution, visual print inspection and first-real-month usefulness still open. Later phases remain
unbuilt. No item in this document is a production-deployment claim.

This roadmap converts the research into sequenced work for a personal, single-user tool.
It preserves the research classifications, cautions and historical decisions. The default
sequence from research Section 8 remains intact because Phase 1 can deliver daily value
without new backend state, while Phase 0 bounds the claims that history-dependent Phase 2
may make.

## Operating rules

- Keep at most three concrete items in **Next**. Phase 0 and Phase 1 are complete; Phase 2 is the
  only current Next item, and completion does not force a replacement item.
- Pair Phase 1's everyday improvement with Phase 2's enjoyable signature feature.
- Finish and verify each usable slice before adding settings, integrations or variants.
- Leave Phase 3, all Phase 4 alternatives, experiments and older possibilities in **Later**.
- A declined idea remains declined until the owner makes a fresh explicit decision.
- Prefer existing routes, data and browser features. Add no service for speculative scale.
- Do not add GraphQL, CRDTs, a queue service, a second backend, new background polling or
  scheduled notifications.
- Use **observed**, **recorded** and **estimated** exactly where the source data requires it.
- Current mutable metadata is not a complete historical event log.
- Compact automatic library backup and full-history recovery are separate products.

## Sequence at a glance

| Order | Item | Board state | Outcome | Entry gate | Exit gate |
| --- | --- | --- | --- | --- | --- |
| 0 | Bounded foundation check | Complete, bounded local audit | Known recovery coverage and honest metric vocabulary | None | Evidence recorded; external unknowns remain explicit |
| 1 | Saved views + Explorer quick actions | Complete; P1a and re-scoped P1b done | Return to an Explorer view and resume from browsing | Roadmap shaped | P1a and P1b acceptance checks pass |
| 2 | Monthly Reading Replay | Implemented locally; exit evidence open | One polished month-level reading story | P0 evidence complete; P1 usable | Replay checks pass and first real month is useful |
| 3 | Per-novel binge thresholds | Later | Personal observed-backlog readiness | P1/P2 real-use pause | Threshold shelf helps choose what to resume |
| 4 | Select one alternative | Later, unselected | Address the strongest observed friction or enjoyment | Owner selects from evidence | Selected proposal's checks pass |

## Completed foundation — Phase 0: bounded foundation check

**Classification:** proposed maintenance/foundation check; a bounded prerequisite for truthful
history features, not a general infrastructure programme.

### Smallest useful release

1. Record whether the deployed revision, migrations and authentication/export changes can be
   verified in their actual environment. Record **unknown** where access or evidence is absent.
2. Record current quota/egress evidence separately from runtime-error alerting; one does not
   prove the other.
3. Attempt the full user export/import integration checks against an isolated database. If no
   suitable target is available, record the exact limitation rather than treating the check as a
   pass or an application failure.
4. Keep the existing compact-backup restore check separate and state its intentionally reduced
   scope: current library state, selected progress, notes, bookmarks and categories.
5. Record whether a full-database backup artifact has been restored in an isolated compatible
   target. The presence of a dump file alone does not pass this check.
6. Publish the metric contract used by Replay: recorded reading dates, observed novel/chapter
   visits and ranges, estimated session time, offline upload-date limitation and partial coverage.

### Exact surfaces

Current implementation and evidence files:

- [`src/services/ExportService.ts`](../src/services/ExportService.ts) — full export versus
  `library-backup` compact scope.
- [`src/services/ImportService.ts`](../src/services/ImportService.ts) — versioned, atomic JSON
  restore behaviour.
- [`src/services/BackupService.ts`](../src/services/BackupService.ts) and
  [`src/routes/backups.ts`](../src/routes/backups.ts) — automatic compact backup path.
- [`src/routes/novels.ts`](../src/routes/novels.ts) — full JSON export/import handlers.
- [`src/routes/stats.ts`](../src/routes/stats.ts) — current daily and library-health definitions.
- [`src/routes/history.ts`](../src/routes/history.ts) — trailing-day recorded history aggregation.
- [`src/routes/progress.ts`](../src/routes/progress.ts),
  [`userscript/src/services/ProgressSync.ts`](../userscript/src/services/ProgressSync.ts) and
  [`userscript/src/services/OfflineQueue.ts`](../userscript/src/services/OfflineQueue.ts) — time,
  accepted writes and offline chronology semantics.
- [`docs/BACKUPS.md`](./BACKUPS.md), [`docs/DEPLOYMENT.md`](./DEPLOYMENT.md) and
  [`docs/SECURITY-REMEDIATION-2026-09-11.md`](./SECURITY-REMEDIATION-2026-09-11.md) — operational
  procedures and claims to verify.
- [`__tests__/integration/recovery.test.ts`](../__tests__/integration/recovery.test.ts),
  [`__tests__/integration/compactBackup.test.ts`](../__tests__/integration/compactBackup.test.ts),
  [`__tests__/regression/backupSizeLimit.test.ts`](../__tests__/regression/backupSizeLimit.test.ts)
  and [`__tests__/regression/securityBoundaries.test.ts`](../__tests__/regression/securityBoundaries.test.ts)
  — existing recovery and boundary checks.

Current UI and HTTP routes:

- UI: `/app/settings`, the current export/import, backup and library-health surface.
- `GET /api/v1/export` and `POST /api/v1/import`: full app JSON recovery path.
- `GET /api/v1/backups` and `POST /api/v1/backups/run`: compact automatic backup path.
- `GET /api/v1/stats/library`: coverage indicators such as oldest/newest snapshot.
- `GET /api/v1/stats/daily?from=YYYY-MM-DD&to=YYYY-MM-DD`: recorded daily aggregates.
- `GET /api/v1/history?days=N`: current trailing-day history, not arbitrary month history.

No new public route is required for the foundation check. Evidence may be added to this roadmap
or the existing recovery/remediation documents only after it has actually been observed.

### Evidence recorded on 15 September 2026

- Thirteen focused `backupSizeLimit` and `securityBoundaries` regression checks passed locally.
- Nine recovery/compact integration checks could not run because the configured disposable
  PostgreSQL target on `127.0.0.1:55439` refused the connection. This is **not** a failed restore
  and is **not** restore proof; there was no available isolated database.
- Code inspection confirms the full-versus-compact export scope distinction described above.
- No raw database dump was restored. Full-history restoration therefore remains unverified.
- Production commit, deployed migrations, quota headroom, egress alarm coverage, database TLS and
  live restoration remain unknown because no provider evidence or build identifier was available.
- These unknowns constrain Phase 2 durability/production claims. They do not block local P1a,
  which changes browser URL state and uses the existing novels response.

### Acceptance checks

- Deployment revision, migration state and quota status are each either evidenced or explicitly
  marked unknown; local tests never stand in for production evidence.
- Full JSON export/import and compact backup scopes and test status are reported separately; an
  unavailable database is never reported as a passed restore.
- A full-history restore is claimed only after isolated restoration and record-level inspection.
- A database dump is not described as app-importable JSON.
- Replay terms map to their actual source queries and caveats.
- Estimated time is never called exact active reading time.
- Offline activity may appear on upload date; no check claims to reconstruct original chronology.
- Chapter visits/ranges are not renamed completed chapters, and jumps do not imply intermediates.
- Sparse or empty periods are described as partial recorded coverage, with no inferred cause.
- The check ends once the evidence ledger and metric contract are complete; unrelated operations
  work cannot hold Phase 1 open indefinitely.

### Deferred and expansion condition

Defer a new backup format, continuous quota monitor, history repair, `observed_at` migration and
general analytics rewrite. Expand only when a concrete restore gap, recurring quota incident or
Replay claim cannot be handled honestly with the current bounded data.

### Section 7 constraints

All Section 7 constraints apply. Of special importance: sessions include elapsed page time;
active sessions may appear late; offline entries are coalesced and dated on upload; snapshots
record visits, not verified completions; metadata can be stale; compact backups omit detailed
history; and history queries must remain bounded and aggregated in PostgreSQL.

## Completed — Phase 1: saved views + Explorer quick actions

**Classification:** saved-view persistence is **new** above existing filters; Explorer progress,
status and Continue actions are a previously documented **extension**. Nothing here approves
shelf recommendations or a recommendation engine.

### P1a — URL-preserved Explorer views, first vertical slice

**Status: complete for the local vertical slice (15 September 2026).** The URL contract,
Explorer integration behaviour and automated acceptance checks are implemented. P1b was later
re-scoped by explicit owner decision and completed, so the parent Phase 1 item is complete.

Concrete deliverables:

1. Make the URL query string the source of truth for supported Explorer state: text search,
   genre include/exclude and match mode, statuses, author, minimum chapters, update window,
   favourites-only, sort and grid/list view.
2. Initialise controls safely from the URL and serialize only validated supported values.
3. Preserve unrelated query parameters so this slice does not erase another feature's state.
4. Push discrete choices into browser history so Back/Forward revisits earlier useful views.
5. Group typing in a focused text/number field into one history entry rather than one entry per
   keystroke; commit that edit when focus leaves the field.
6. Reset the supported view state atomically while retaining unrelated parameters.
7. Keep browser bookmarks as the persistence mechanism; add no database or settings contract.

Exact files:

- Modify [`frontend/src/pages/Explorer.tsx`](../frontend/src/pages/Explorer.tsx).
- Add `frontend/src/lib/explorerView.ts` for the bounded parse/serialize contract.
- Add `frontend/src/lib/explorerView.test.ts` for invalid/default/round-trip behaviour.
- Add `frontend/src/pages/Explorer.test.tsx` for reload, history and reset behaviour.
- Reuse [`frontend/src/lib/explorerFilters.ts`](../frontend/src/lib/explorerFilters.ts) and
  [`frontend/src/lib/novelSort.ts`](../frontend/src/lib/novelSort.ts); change them only if the
  parser needs an exported existing constant.

Routes:

- UI: existing `/app/explorer?<supported-state>`.
- HTTP: existing `GET /api/v1/novels` through the current frontend client.
- No new HTTP route, database column or preference setting.

P1a acceptance checks:

- Reloading or bookmarking an Explorer URL reproduces the selected view.
- Browser Back/Forward restores previous filters instead of resetting them.
- Invalid, duplicate or outdated values fall back safely without a crash.
- Default state yields a clean, stable URL and equivalent results.
- Genre values round-trip without losing include/exclude meaning.
- Search, author and numeric typing do not create unusable per-keystroke history.
- Reset is one coherent navigation and preserves unknown unrelated parameters.
- Existing filtering and sorting results remain unchanged for equivalent state.

### P1b — Explorer context and quick actions, subsequent vertical slice

**Status: resolved and complete locally (15 September 2026), re-scoped by explicit owner
decision.** Explorer stays a browse/filter surface; My List already owns the resume-reading
action, so the Continue link (items 2-4 below) was declined rather than built.

Concrete deliverables:

1. Show current saved chapter/progress and reading status on grid and list cards. — **Done for
   list view.** Grid view intentionally unchanged (owner decision: keep it a lightweight
   cover-only browse mode).
2. Add an accessible Continue link when `latest_url` or `primary_url` exists. — **Declined.**
3. Build the Continue URL with the existing `resumeUrl` behaviour and saved percent. — **N/A**,
   per item 2.
4. Restructure each card so a Continue link is never nested inside the novel-detail link. — **N/A**;
   moot without a Continue link. List cards remain a single detail `<Link>`, unchanged in shape.
5. Keep detail navigation and Continue reachable by keyboard and touch without hover. — **N/A** for
   Continue; existing detail-link keyboard/touch access was already correct and untouched.

Additional local change made alongside this work, outside the original P1b list: Explorer's page
container and list-view card width were widened (`frontend/src/components/Layout.tsx`,
`frontend/src/pages/Explorer.tsx`) so wider list cards remain centered instead of full-bleed.

Exact files and routes:

- Modify [`frontend/src/pages/Explorer.tsx`](../frontend/src/pages/Explorer.tsx) and its focused
  component tests.
- Reuse [`frontend/src/api/client.ts`](../frontend/src/api/client.ts) `resumeUrl` and the current
  `Novel` payload in [`frontend/src/types/index.ts`](../frontend/src/types/index.ts).
- Use existing UI `/app/explorer` and `/app/novel/:novelId` routes.
- Continue opens the novel's external saved `latest_url` plus position, or `primary_url` fallback.
- Continue performs no progress write; no new HTTP route is required.

P1b acceptance checks, from the research:

- Continue opens the existing saved location and does not alter progress by itself. — **N/A**,
  Continue declined.
- Keyboard and touch users can access the same actions as mouse users. — **Done**; unchanged from
  the existing detail-link behaviour, no new action was added.
- The card contains no nested interactive elements and keeps a clear detail target. — **Done**;
  list cards are a single `<Link>`, verified by a focused test.
- Missing progress, status, source URL or cover has an honest usable fallback. — **Done**; missing
  progress shows "Not started" instead of a false 0%, and status always renders.
- A preserved view updates its results after relevant `/novels` cache/socket changes. — **Done**;
  unchanged existing SWR wiring, no regression.

### Phase 1 combined exit gate

- P1a checks pass locally: reload/bookmark reproduction; Back/Forward restoration; safe invalid,
  duplicate and obsolete fallback; clean default serialization; genre meaning preservation;
  grouped search/author/number edits; atomic reset/clear; unrelated-parameter preservation; and
  unchanged equivalent filtering/sorting results. Automated UI coverage also verifies detail-link
  return and live SWR library updates.
- P1b is resolved: Continue was declined by owner decision; the remaining keyboard/touch parity
  and no-nested-interactive-elements checks pass, since list cards keep their original single-link
  shape. Phase 1 is complete as re-scoped.
- Focused tests, the full frontend test suite, frontend lint and frontend build pass locally.

### Deferred and expansion condition

Defer named/cross-device views, JSON settings storage, custom query language, recommendation
scoring, visual rule builders and sidebar customisation. Add a dedicated validated settings
contract only after several distinct combinations are repeatedly reused or bookmarks fail across
devices. Save definitions rather than frozen result lists.

### Section 7 constraints

Use existing library data and cache updates. Do not add polling. Unknown/stale source metadata
stays unknown/stale. URL state contains filters, never private novel data or frozen results.

## Next 1 of 1 — Phase 2: Monthly Reading Replay

**Classification:** **rescope** of accepted/deferred Reading Wrapped; consolidation with accepted
reading personality and the open Time Machine idea. It is one destination, with no December
dependency and no inferred personality labels in the first release.

**Entry gate:** Phase 0 has recorded metric/recovery boundaries and Phase 1 has a usable vertical
slice. Lack of verified lifetime recovery limits promises; it does not prevent an honestly scoped
single-month replay.

**Status: implemented locally (16 September 2026); final exit evidence remains open.** The bounded
API, page, navigation, responsive/print rules and focused tests are present. The complete automated
suite passes. A disposable PostgreSQL target was not available for a real DST-transition fixture,
the print layout has not had a visual paper/PDF inspection, and the first real month has not yet
been judged useful. These are recorded limits rather than silent passes.

### Smallest useful release

1. Add one Replay page with a calendar-month selector and explicit display timezone.
2. Fetch one bounded month on demand and show a cover montage plus day-by-day reading view.
3. State only recorded facts: titles visited, recorded reading days and observed chapter ranges.
4. Show started/completed titles only where recorded dates directly support those statements.
5. Label time as estimated and make partial coverage and offline upload dates understandable.
6. Supply honest empty and partially recorded states.
7. Provide a narrow-screen and print-friendly layout using existing visual language and covers.

### Exact implemented surfaces

- Added [`frontend/src/pages/Replay.tsx`](../frontend/src/pages/Replay.tsx) and
  [`frontend/src/pages/Replay.test.tsx`](../frontend/src/pages/Replay.test.tsx).
- Modified [`frontend/src/App.tsx`](../frontend/src/App.tsx) for UI route `/app/replay` and
  [`frontend/src/components/Layout.tsx`](../frontend/src/components/Layout.tsx) for the permanent
  Replay navigation entry.
- Modified [`frontend/src/api/client.ts`](../frontend/src/api/client.ts) and
  [`frontend/src/types/index.ts`](../frontend/src/types/index.ts) for the bounded response.
- Modified [`frontend/src/components/Icon.tsx`](../frontend/src/components/Icon.tsx) for the
  existing icon wrapper and [`frontend/src/page-signatures.css`](../frontend/src/page-signatures.css)
  for narrow-screen and print presentation.
- Modified [`src/routes/stats.ts`](../src/routes/stats.ts) to aggregate month-bounded snapshots,
  mutable milestones and session overlap in PostgreSQL.
- Added [`__tests__/regression/statsReplay.test.ts`](../__tests__/regression/statsReplay.test.ts)
  for validation, half-open bounds, numeric normalization, honest ranges, session clipping and an
  empty leap-February response.
- Existing cover URL handling was reused. `ActivityHeatmap`, `ReadingTimeline` and `History` were
  inspected but not reused: they self-fetch different time windows and encode semantics that would
  be misleading for this single bounded response.

Implemented routes:

- UI: `/app/replay?month=YYYY-MM`.
- HTTP: `GET /api/v1/stats/replay?month=YYYY-MM&timezone=Europe/London`.
- The API accepts one validated calendar month and IANA timezone and returns a bounded
  summary. It does not return lifetime snapshots or run on socket progress events.

### Local evidence recorded on 16 September 2026

- The API validates `YYYY-MM` and IANA timezone input, rejects year zero, derives timezone-aware
  half-open month/day bounds in PostgreSQL and keeps snapshot/coverage work inside that month.
- Sessions crossing local midnight are divided proportionally by their overlap with each local
  day. Time remains labelled estimated because the stored session value can include elapsed page
  time.
- The page supports a URL-preserved native month selector, cover montage, recorded facts,
  observed chapter ranges, current saved milestones, day-by-day activity, honest empty/error
  states, narrow layout and print CSS.
- Milestone-only months remain visible. Recorded chapter-position coverage is described separately
  because its range comes from snapshots, not sessions or mutable milestone dates.
- Backend review found no release need for a new composite index in this single-user app: the
  existing `progress_snapshots(created_at)` index bounds the month. Revisit only if multi-user
  operation or an actual query plan demonstrates a problem.
- Full `npm run verify` passed: 49 backend files passed and 2 database-dependent files skipped
  (326 tests passed, 9 skipped); 18 frontend files and 113 tests passed; backend type/check,
  frontend lint/build and userscript build passed.
- Focused review findings for milestone-only months, month-bounded coverage wording and sessions
  crossing midnight were fixed before the full verification run.

### Acceptance checks, from the research

- Calendar boundaries, February, leap years and daylight-saving changes do not misplace records.
- Empty and partially recorded months have honest, useful states.
- Offline uploads are not presented as exact original reading dates.
- Corrections and chapter jumps do not manufacture impressive reading totals.
- Export/print remains legible on a narrow screen and on paper.
- Response size and query work stay bounded as lifetime history grows.
- A recorded visit is not called a completed chapter; intervening chapters are not inferred.
- Return-after-a-break copy appears only with activity evidence before and after the gap.

### Deferred and expansion condition

Defer whole-lifetime animation, separate Wrapped/personality/Time Machine pages, inferred labels,
exact active-minute claims, automatic image generation and comparisons. Expand only if the owner
deliberately revisits Replay after the first month; compare months or allow chosen favourite
moments before adding more charts.

### Section 7 constraints

Use a timezone-aware half-open month interval. Active sessions may appear later. Offline records
may land on upload date. Distinct novel/chapter snapshot pairs are observed visits, not verified
completion or separate read-throughs. Manual corrections and mutable metadata can change the
apparent story. Show recorded coverage. Compact backups do not preserve the detailed history on
which durable lifetime Replay would depend.

## Later

### Phase 3 — per-novel binge thresholds

**Classification:** new personal shelf rule above the existing fixed Behind 5+ filter.

#### Smallest useful release

1. Add nullable, bounded positive `binge_threshold_chapters` to `user_novel_meta`.
2. Define the threshold as current unread chapter backlog. Reading reduces the backlog; this is
   not “releases since I paused,” which would require a stored baseline.
3. Return ready/not-ready/unknown inputs in the existing novel payload and calculate with the
   current [`behindCount`](../frontend/src/lib/behindStatus.ts) semantics.
4. Add a Ready to binge smart shelf in My List, progress such as `18 / 30`, the latest observation
   date and a way to set, change or remove the threshold.
5. Preserve the novel's reading status, including on-hold. Add no automatic status changes,
   scheduled refresh, scraper or notification delivery.
6. Include the field in validated full/compact export and import behaviour and prove restoration.

#### Exact proposed files and routes

- Add `src/db/migrations/020_binge_threshold.sql`; update [`src/db/schema.ts`](../src/db/schema.ts)
  only where its bootstrap schema must match the migration.
- Modify [`src/routes/novels.ts`](../src/routes/novels.ts),
  [`src/services/ExportService.ts`](../src/services/ExportService.ts) and
  [`src/services/ImportService.ts`](../src/services/ImportService.ts).
- Modify [`frontend/src/types/index.ts`](../frontend/src/types/index.ts),
  [`frontend/src/api/client.ts`](../frontend/src/api/client.ts),
  [`frontend/src/lib/behindStatus.ts`](../frontend/src/lib/behindStatus.ts),
  [`frontend/src/lib/smartFilters.ts`](../frontend/src/lib/smartFilters.ts),
  [`frontend/src/pages/MyList.tsx`](../frontend/src/pages/MyList.tsx) and
  [`frontend/src/components/MyListTable.tsx`](../frontend/src/components/MyListTable.tsx).
- Extend [`__tests__/regression/behindBadge.test.ts`](../__tests__/regression/behindBadge.test.ts),
  [`__tests__/regression/smartFilters.test.ts`](../__tests__/regression/smartFilters.test.ts) and
  the appropriate recovery integration test.
- UI route: existing `/app/mylist`, with a Ready to binge smart filter and per-novel control.
- HTTP read route: existing `GET /api/v1/novels`.
- HTTP write route: proposed `PUT /api/v1/novels/:novelId/binge-threshold`, accepting a bounded
  positive integer or `null`. Do not put per-novel state in `/api/v1/settings/prefs`.

#### Acceptance checks

- Readiness changes correctly immediately below, at and above the threshold.
- Unknown chapter counts and missing progress never produce a false ready state.
- Reading progress, manual corrections and rereads recalculate the shelf coherently.
- On-hold titles remain on hold until the owner changes them.
- The display says when its source chapter count was last observed.
- Export and isolated restore preserve the setting and subsequent readiness behaviour.

#### Deferred and expansion condition

Defer release-date prediction, cadence modelling, automatic status changes and push alerts. If
alerts are ever explicitly accepted, notify once on a meaningful threshold crossing with
deduplication. Expand only after several novels are actually parked to accumulate chapters; if
that habit is rare, saved views already cover the choice problem.

#### Section 7 constraints

Latest count, refresh time and publication time are different facts. Unknown latest count means
unknown readiness, not zero. A stale or regressed observation must stay visibly uncertain, and a
known count does not prove every chapter is accessible. Reuse the current library response and
socket invalidation; add no polling. The new setting is not recoverable until export validation
and an isolated restore demonstrate it.

### Phase 4 — alternatives; select one after real use

No Phase 4 option is selected. Choosing one does not approve the others.

#### Explicit browsing mode

**Classification:** new explicit mode extending existing backward-peek protection.

Smallest useful release: add one visible “Browsing — progress paused” control scoped initially to
the current tab and novel; preserve that state across applicable full-page chapter navigation;
suppress new reading writes; retain legitimate queue entries created before pausing; link back to
the saved location; and require an explicit Resume tracking or Continue from here action.

Exact files and routes:

- Modify [`userscript/src/main.ts`](../userscript/src/main.ts),
  [`userscript/src/services/ProgressSync.ts`](../userscript/src/services/ProgressSync.ts),
  [`userscript/src/services/OfflineQueue.ts`](../userscript/src/services/OfflineQueue.ts) and
  [`userscript/src/services/UIManager.ts`](../userscript/src/services/UIManager.ts).
- Audit [`src/services/ProgressPolicy.ts`](../src/services/ProgressPolicy.ts) without changing its
  max-progress/reset/reread contract unless a focused test proves a server-side change is needed.
- Extend `userscript/__tests__/completionSync.test.ts`, `heartbeatSync.test.ts` and
  `offlineQueue.test.ts`, plus [`__tests__/regression/finalProgressSave.test.ts`](../__tests__/regression/finalProgressSave.test.ts)
  if the final/unload path changes.
- UI route: supported external reader chapter pages; no new `/app` page.
- HTTP routes: browsing suppresses new writes to existing `POST /api/v1/progress`; the saved
  position continues to come from existing `GET /api/v1/progress`. No new backend route.

Acceptance checks:

- Browsing ahead cannot advance the saved position through debounced, completion, heartbeat,
  final/unload or offline replay paths.
- Reload, chapter navigation and closing the tab do not leak browsing progress.
- Previously queued legitimate reading is preserved.
- Resuming behaves correctly at earlier, same and later locations without bypassing correction or
  reread rules.
- A second device's genuine reading is not overwritten by stale paused-tab state.
- An obvious persistent indicator prevents accidentally leaving tracking paused.

Defer automatic reading-versus-skimming detection, new conflict algorithms and event sourcing.
Select this option only when browsing ahead or checking references causes unwanted progress.

Section 7 constraints: saved progress, browsing location and completed reading remain separate
concepts. Offline queue entries are coalesced recovery data, not an activity ledger. Never enqueue
browsing writes for later upload, and do not discard accepted pre-pause reading.

#### Narrow reader-comfort controls

**Classification:** extension of current userscript tools aligned with the accepted accessible
overlay. Full reader mode remains separately declined.

Smallest useful release: font size, line spacing, text width and the existing auto-scroll speed;
browser-local persistence; an easy reset; and a reversible focus treatment only if the first four
controls prove insufficient. Apply the chosen layout before restoring position where possible.

Exact files and routes:

- Modify [`userscript/src/main.ts`](../userscript/src/main.ts),
  [`userscript/src/config.ts`](../userscript/src/config.ts) and
  [`userscript/src/services/UIManager.ts`](../userscript/src/services/UIManager.ts), reusing current
  site/content detection and auto-scroll behaviour.
- Add one focused userscript test for preference lifetime, reset and progress suppression around
  layout changes. Add no styling dependency.
- UI route: supported external reader pages; no new `/app` page.
- HTTP routes: none for the browser-local first release. Cross-device controls would require a
  later authenticated validated contract; `/api/v1/settings/prefs` is not assumed to fit.

Acceptance checks:

- Controls work on supported source layouts and narrow screens.
- Reset restores normal source-page behaviour.
- Layout adjustment does not unexpectedly advance the saved bookmark.
- Preferences survive the agreed browser and navigation lifetime.
- Keyboard focus and text remain usable in normal and focus states.
- Any hidden source controls become recoverable when focus mode is disabled.

Defer a standalone content renderer, automatic theme scheduling, many presets and unrelated-site
support. Expand only when a specific setting improves actual reading; a replacement reader needs
a fresh explicit decision.

Section 7 constraints: font and width changes reflow the page and change scroll percentage. Apply
preferences before restore, ignore layout-only movement as reading progress and test mid-chapter
changes. Third-party DOM/CSS changes are the maintenance boundary.

#### Ambient companion

**Classification:** accepted existing proposal, still unbuilt; retain its informational second-
screen shape.

Smallest useful release: an authenticated dedicated view seeded from saved progress; cover, title,
chapter and percentage; updates through the shared socket; a simple inactivity transition to idle;
disconnected state distinct from idle; and ordinary browser fullscreen if useful.

Exact files and routes:

- Add `frontend/src/pages/Companion.tsx` and a focused `Companion.test.tsx`.
- Modify [`frontend/src/App.tsx`](../frontend/src/App.tsx) for the route and reuse
  [`frontend/src/hooks/useSocket.ts`](../frontend/src/hooks/useSocket.ts),
  [`frontend/src/components/Layout.tsx`](../frontend/src/components/Layout.tsx),
  [`frontend/src/pages/Dashboard.tsx`](../frontend/src/pages/Dashboard.tsx) and current types/API.
- Verify event shape at [`src/routes/progress.ts`](../src/routes/progress.ts); add no transport.
- UI route: proposed `/app/companion`.
- HTTP/socket routes: existing `GET /api/v1/novels` for the initial saved state and existing
  authenticated Socket.IO `progress:updated` events. Do not add polling.

Acceptance checks:

- The view works on first load, after reconnect and after the active novel changes.
- Idle and disconnected states are visibly different.
- It reuses the shared socket and never refetches the full library for each update.
- Logout removes authenticated access and live updates.
- Long titles, missing covers and reduced-motion preferences are handled.

Defer precise presence, synchronized timers, hardware integrations and elaborate idle animation.
Select only when a real second display will be left open during reading.

Section 7 constraints: recent sync is only an approximation of presence because long paragraphs
may produce no event. Use “Recently active,” never exact attention or an exact session timer. The
removed bot cannot supply scanning state, and idle decoration does not justify polling.

#### Passage capture and retrieval

**Classification:** extension of the open capture/highlight direction using dormant bookmark APIs.
Broad unified search remains declined and is not renamed passage retrieval.

Smallest useful release: save selected escaped text in the existing bookmark note field with
`bookmark_type=highlight`, source URL and position; show it on the novel page or one simple
collection; keep selected text available after a failed save; explain duplicate-position
conflicts; and use actual request/storage limits. Add limited filtering only after the collection
is large enough to need it.

Exact files and routes:

- Modify [`userscript/src/api/client.ts`](../userscript/src/api/client.ts) and
  [`userscript/src/services/UIManager.ts`](../userscript/src/services/UIManager.ts) for capture.
- Reuse [`frontend/src/api/client.ts`](../frontend/src/api/client.ts),
  [`frontend/src/components/NotesPanel.tsx`](../frontend/src/components/NotesPanel.tsx) and
  [`frontend/src/pages/Novel.tsx`](../frontend/src/pages/Novel.tsx), or add a single
  `frontend/src/pages/Passages.tsx` collection only if novel-scoped retrieval is insufficient.
- Verify validation and duplicate semantics in
  [`src/routes/bookmarks.ts`](../src/routes/bookmarks.ts); bookmarks already participate in
  [`src/services/ExportService.ts`](../src/services/ExportService.ts) and
  [`src/services/ImportService.ts`](../src/services/ImportService.ts).
- UI routes: supported external reader pages for capture and existing `/app/novel/:novelId` for
  retrieval; proposed `/app/passages` only if a collection page earns inclusion.
- HTTP routes: existing `POST /api/v1/bookmarks`, `GET /api/v1/bookmarks/:novelId`, paginated
  `GET /api/v1/bookmarks?bookmark_type=highlight`, and existing bookmark update/delete routes.

Acceptance checks:

- Saved passages are escaped text and retain their source link.
- Failed saves do not look successful or lose selected text without recourse.
- Duplicate-position behaviour is clear, including the current user/novel/URL/percentage collision.
- Long passages respect the configured note and request limits.
- Novel and collection views do not fetch all passage text in the normal library payload.
- Full and compact export/restore preserve captured material.

Defer precise inline re-highlighting after source edits, full-text chapter search, a new search
service and cross-library semantic search. Expand only after passages are regularly captured and
retrieval becomes a real frustration.

Section 7 constraints: fetch large text on demand and keep it out of `GET /api/v1/novels`. The
current bookmark model has no selected-quote field, character range or stable DOM anchor, so this
release does not promise re-anchoring. If quote and annotation must become distinct, make that a
deliberate later schema and recovery change.

### Other Later items

- **Named cross-device views:** proposed P1 expansion, only after URL bookmarks prove insufficient;
  requires a dedicated bounded JSON contract because `/api/v1/settings/prefs` accepts allowlisted
  scalar values only.
- **Replay comparison or favourite moments:** proposed P2 expansion, only after repeat Replay use.
- **Personal glossary/story memory:** older brainstorm retained as an experiment. Test manual
  per-novel notes first. Automated extraction remains deferred until a deliberate chapter-content,
  grounding, deletion, export and cost project is accepted.
- **NovelUpdates bridge:** accepted/unscoped. Reconsider only with real duplicate-list maintenance
  and verified integration feasibility.
- **Conflict history:** accepted only together with manual resolution; a passive log does not meet
  the accepted requirement.
- **Mirror/duplicate detector:** parked until real duplicates justify it.

## Preserved decision ledger

These statuses are binding planning inputs, not ideas to revisit under renamed headings.

| Item | Preserved status | Roadmap treatment |
| --- | --- | --- |
| Reading Wrapped | Accepted/deferred with coverage caveats | Rescoped into Monthly Replay |
| Reading personality | Accepted and linked to Wrapped | Consolidated into Replay; labels deferred |
| Time Machine | Open signature proposal | Possible later Replay interaction only |
| Ambient second-screen companion | Accepted; design incomplete | Phase 4 alternative, informational shape preserved |
| Accessible reader overlay | Accepted/unscoped | Narrow comfort alternative only |
| Full reader mode | Previously declined (Gateway #09) | Excluded; needs a fresh explicit owner decision |
| Unified search | Previously declined (Gateway #08) | Excluded; passage retrieval stays scoped separately |
| Standing goals | Previously declined, later reintroduced | Excluded from Next and Later implementation |
| Shelf recommendations | Previously declined, later reintroduced | Excluded; owner-selected filters/thresholds instead |
| Finish ETA / catch-up countdown | Previously declined | Excluded; current time precision also insufficient |
| Since-you-left / reading digests | Prior variants declined | Excluded; no scheduled notification system |
| Spoiler-gated notes | Previously declined | Excluded; no automatic note visibility gating |
| Conflict history | Accepted only with manual resolution | Later only in accepted complete shape |
| NovelUpdates bridge | Accepted/unscoped | Later behind need and feasibility checks |
| Mirror/duplicate detector | Parked | Later only when actual duplicates exist |

Additional explicit deferrals from research Section 9:

- GraphQL beside REST: reconsider only for a client/query problem REST cannot reasonably solve.
- CRDTs: reconsider only for a demonstrated conflict unmet by current domain rules.
- Queue service or second backend: no current workflow justifies either.
- Extension migration: reconsider only when the userscript blocks a wanted workflow.
- Full offline reader/PWA: reconsider only for recurring offline chapter-reading need.
- More source sites: reconsider for a regularly read unsupported source with accepted maintenance.
- Revived server scraper: deleted bot code is not reusable; require a fresh viable access design.
- Automatic dead-novel triage: absence of observation is not abandonment evidence.
- Social/public features: reconsider only if the app's single-user purpose changes.
- Goals/recommendations/ETAs: require a fresh explicit owner decision and adequate data.
- Broad search: require enough saved material to produce a real retrieval problem and a fresh choice.
- AI plot assistant: require a successful manual workflow and deliberate grounded content pipeline.
- CLI/raw API explorer: require a recurring task that current UI/API tools make painful.

Stale assumptions remain rejected: deleted bot/Puppeteer code does not make batch import cheap;
`chapters_updated_at` is not publication history; missing refreshes do not prove a dead novel; the
removed bot cannot provide companion scanning state; and sparse history does not prove a wipe.

## Team control pane

All work shares the current checkout by explicit disjoint ownership. The primary orchestrator is
the sole code integrator and implementation writer. No branch has been merged and no production
action is implied.

| Card | Owner | State | Harness / model / effort | Branch · worktree | Scope | Merge gate | Evidence / last update | Blocker owner |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| RD-01 Execution roadmap | `execution_roadmap` | Complete; root reviewed | Codex collaboration sub-agent / `gpt-5.6-sol` / high | `main` · shared `.` | Only this document | Source traced; Next≤3; decisions preserved; root review | This file reviewed; 2026-09-15 | None |
| P0-01 Foundation evidence | `foundation_audit` | Complete; bounded audit with external follow-ups | Codex read-only sub-agent / `gpt-5.6-sol` / high | `main` · shared `.` | Recovery, runtime and metric evidence; no writes | Evidence distinguishes observed/unknown and compact/full | 13 focused checks pass; 9 DB checks unavailable; production/full restore unknown · 2026-09-15 | External follow-ups: `root`/owner |
| P1a-01 URL-preserved views | `root` | Complete; local verification passed | Primary Codex integrator / current session / current effort | `main` · shared `.` | Explorer URL state, bounded parser and focused tests; sole code writer | Focused tests + frontend lint/build + root diff review | 10 focused checks; 17 files/106 tests full frontend suite; lint/build pass · 2026-09-15 | None for local slice |
| P1a-02 Design/test audit | `url_acceptance_audit` | Complete; read-only handoff | Codex read-only sub-agent / `gpt-5.6-sol` / high | `main` · shared `.` | URL semantics and acceptance-test advice; no writes | Handoff covers invalid params, history and reset risks | Audit handoff received; root integrated · 2026-09-15 | None |
| P1b-01 Explorer actions | `root` | Complete; re-scoped locally | Primary Codex integrator / current session / current effort | `main` · shared `.` | Explorer list-view status/progress display; Continue declined | P1b checks pass; lint/tests/build green | 17 files/109 tests, lint, build pass · 2026-09-15 | None |
| P2-01 Monthly Replay | `root` | Implemented locally; exit evidence open | Primary Codex integrator / current session / current effort | `main` · shared `.` | One bounded page/API after P0 | P2 checks + bounded query + honest wording | 326 backend + 113 frontend tests; lint/type/build pass · 2026-09-16 | `root`: live DB DST fixture, visual print check; owner: real-month usefulness |
| LATER-REVIEW | Later reviewers | Backlog | Unassigned until selected | None | Phase 3/4 only after promotion | Acceptance shaped before assignment | This roadmap | `root`/owner choice |

### Orchestration pass result

- **Board change:** the bounded Phase 0 audit, execution roadmap and re-scoped Phase 1 are complete
  locally. Phase 2 is implemented locally with three explicit exit observations still open. All
  other concrete features remain Later.
- **Completed evidence:** full verification now covers P1 and P2: 326 backend tests and 113
  frontend tests pass, with backend type/check, frontend lint/build and userscript build green.
  P2 adds bounded month/timezone validation, overlap-based estimated sessions, milestone-only and
  empty/error UI cases, observed wording, navigation and narrow/print styling.
- **Pending work:** execute the replay SQL against a disposable PostgreSQL DST-transition fixture,
  visually inspect paper/PDF output, and use one real month. Phase 1 has no pending work; P1b's
  Continue link remains explicitly declined because My List owns resume actions.
- **Blockers:** the unavailable isolated database blocks only live SQL/DST proof, not the local
  implementation. Production/full-history unknowns still constrain durability claims. Phase 4
  needs the owner's later choice based on actual friction or enjoyment. No merge, commit, push or
  production deployment is claimed.
- **Reusable skill candidate:** none. Promote no project-specific workflow after one use.
