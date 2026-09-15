# ReadSync: roadmap research and next-feature guide

**Prepared:** 15 September 2026  
**Code reviewed:** `main` at `ad9f805`  
**Market research:** 14 September 2026; consolidated with three completed codebase reviews on 15 September  
**Audience:** the sole reader and builder of ReadSync  
**Status:** recommendations and proposed scopes, not implementation commitments

This is a separate research document. It does not replace the [current roadmap](../ROADMAP.md), change historical decisions, or claim that any proposed feature has shipped. It brings together the market research, frontend/userscript review, backend/data review, and roadmap/history audit from this conversation.

The purpose is to give ReadSync more everyday usefulness and visible enjoyment without turning a personal project into a collection of services that need constant maintenance.

## Contents

1. [Recommended direction](#1-recommended-direction)
2. [Evidence and scope](#2-evidence-and-scope)
3. [What ReadSync already has](#3-what-readsync-already-has)
4. [What the market suggests](#4-what-the-market-suggests)
5. [Existing decisions and roadmap contradictions](#5-existing-decisions-and-roadmap-contradictions)
6. [Detailed feature proposals](#6-detailed-feature-proposals)
7. [Data quality and recovery requirements](#7-data-quality-and-recovery-requirements)
8. [Build sequence and healthy project rhythm](#8-build-sequence-and-healthy-project-rhythm)
9. [What to defer](#9-what-to-defer)
10. [Combined conclusions from the three agents](#10-combined-conclusions-from-the-three-agents)
11. [Source index](#11-source-index)

## 1. Recommended direction

ReadSync's strongest next direction is a more personal companion for long-running web novels: make the library easier to act on, help choose when to return to a story, and turn recorded reading into something enjoyable to revisit.

The recommended next pair is:

1. **Saved views and Explorer quick actions** for a practical improvement you can use immediately.
2. **Monthly Reading Replay** for a distinctive, visually satisfying feature.

Follow those with **per-novel binge thresholds**. Keep **explicit browsing mode** and the already accepted **ambient companion** as the next candidates. Narrow reader-comfort controls are a good alternative if the source-page reading experience is the bigger daily irritation.

| Order | Proposal | Main benefit | Relationship to existing work | Relative first-version effort | Ongoing maintenance |
| --- | --- | --- | --- | --- | --- |
| 1 | Saved views + Explorer quick actions | Less repeated setup and fewer clicks | New persistence above existing filters; actions address a documented gap | Small to medium | Low |
| 2 | Monthly Reading Replay | Enjoyment, memory, a signature feature | Rescopes Wrapped and overlaps personality/Time Machine | Medium | Low to medium |
| 3 | Per-novel binge thresholds | Return when enough chapters have accumulated | New personal rule above existing Behind 5+ filter | Medium | Low if based on existing refreshes |
| 4 | Explicit browsing mode | Inspect chapters without advancing progress | Extends existing backward-peek protection | Medium, correctness-sensitive | Medium |
| 5 | Ambient companion | A pleasing live reading display | Already accepted, still unbuilt | Small to medium | Low with timeout-based activity |
| Alternative | Reader-comfort controls | Better reading ergonomics | Narrow accessible overlay accepted; full reader mode previously declined | Medium | Medium because source pages change |
| Later | Passage capture and retrieval | Remember and rediscover favourite moments | Activates existing bookmark support; cross-library search has a decision conflict | Medium | Low for excerpts; higher for inline highlighting |
| Experiment | Personal glossary / story memory | Recall names, terms and context | Older brainstorm, not a newly discovered idea | Small manual prototype; large automated version | Depends heavily on automation |

These are relative scope estimates, not delivery promises. "Small" means a bounded improvement using current data and infrastructure. "Medium" means a complete workflow spanning several surfaces or requiring meaningful correctness checks. A new reader engine or chapter-text ingestion pipeline is larger than any of these first versions.

The useful measure of success is whether you naturally use the feature after its novelty wears off. Public-market adoption is not required for a single-user tool to be worth building.

## 2. Evidence and scope

### Local evidence

The reviews covered the current frontend and userscript flows, backend routes and data model, relevant tests, the roadmap, historical proposal decisions, and recent commits. The three independent reviews were:

- **Reader experience:** existing interactions, duplicate feature traps, and the smallest useful frontend/userscript additions.
- **Data feasibility:** available records and endpoints, missing data, implementation requirements, and recovery implications.
- **Roadmap audit:** accepted, declined, stale, overlapping, and genuinely new proposals.

The completed reviews used a clean working tree at `ad9f805`. They did not access or change production. Local implementation does not establish deployment status.

### External evidence

Research used official product pages, documentation and changelogs for StoryGraph, Readwise Reader, LNReader, Mihon, Kindle and Hardcover. Public feature requests supply examples of reader frustrations, not representative survey results.

This is feature and workflow research. It does not estimate market size, prove demand, or claim that ReadSync should compete commercially with those products. A feature's presence elsewhere is evidence that the interaction is worth considering; your own habits determine whether it belongs here.

### How to read the proposal labels

- **New:** not found in the audited roadmap in this form.
- **Extension:** adds useful behaviour to an existing feature.
- **Rescope:** makes an existing proposal smaller or more coherent.
- **Previously declined:** should not silently become accepted because it appeared in a later brainstorm.
- **Proposed implementation:** a suggested future design, not an endpoint, field or behaviour that exists today.

## 3. What ReadSync already has

The project is beyond a basic tracker. Much of the next phase can be built by connecting existing capabilities.

| Area | Present in the reviewed code | Implication for the roadmap |
| --- | --- | --- |
| Library | Statuses, favourites, half-star ratings, tags/categories, bulk status changes, sorting, My List and Explorer | Do not rebuild shelves, ratings or ordinary filtering |
| Explorer | Genre include/exclude, match-all/match-any, author, chapter-count and update filters, grid/list views | Save these filter definitions instead of inventing a separate filtering system |
| Smart filters | Behind 5+, Updated this week, Almost caught up, Stale reads | A binge feature needs personal thresholds or intent to add value |
| Navigation | Fuzzy command palette with novel navigation, resume, status and copy actions | Search/navigation is not starting from zero |
| Reading | Cross-device progress, restore/resume links, keyboard navigation, auto-scroll, offline progress queue | Comfort controls should improve existing reading tools |
| Progress safety | Max-progress policy, backward-peek banner, explicit correction/reset and reread semantics | New browsing mode must add forward-browsing protection and explicit control |
| Notes | Multiple chapter-labelled notes with create/edit/delete | A new notebook should reuse notes where their model fits |
| Bookmarks | Position/highlight/note/favourite types and CRUD APIs | Passage capture has storage foundations, but not a complete highlighting engine |
| Personal history | Reread history, chapter map, per-novel timeline, History, heatmap, streaks and Around This Time | Replay should curate these records rather than duplicate every chart |
| Statistics | Velocity, pace, ratings-versus-reading, time and hour/weekday/device/genre breakdowns | More statistics alone may add little enjoyment |
| Updates | Browser-driven batch refresh, chapter metadata, behind/hiatus indicators and notifications | Readiness can update when existing observations arrive |
| Realtime | Session-authenticated Socket.IO and local library cache updates | Companion views can reuse existing transport |
| Recovery | Full export, compact automatic library backup, separate full-database backup guide | Library recovery and historical analytics recovery have different coverage |

Key implementation references:

- [Dashboard](../../frontend/src/pages/Dashboard.tsx), [Explorer](../../frontend/src/pages/Explorer.tsx), [My List](../../frontend/src/pages/MyList.tsx).
- [Explorer filter logic](../../frontend/src/lib/explorerFilters.ts), [smart filters](../../frontend/src/lib/smartFilters.ts), [command palette](../../frontend/src/components/CommandPalette.tsx).
- [Notes panel](../../frontend/src/components/NotesPanel.tsx), [bookmark routes](../../src/routes/bookmarks.ts), [notes routes](../../src/routes/notes.ts).
- [Userscript entrypoint](../../userscript/src/main.ts), [progress sync](../../userscript/src/services/ProgressSync.ts), [progress policy](../../src/services/ProgressPolicy.ts).
- [Stats routes](../../src/routes/stats.ts), [History](../../frontend/src/pages/History.tsx), [export service](../../src/services/ExportService.ts).

Some historical docs describe functionality that has since changed. In particular, the September 12 changelog's "not committed" status is no longer current. Its description of displaying zero-session devices was also superseded by later commits. Use the reviewed code for current behaviour and historical docs for the decision trail.

## 4. What the market suggests

### StoryGraph: choosing the next book and enjoying the record

StoryGraph's Up Next feature offers a small manually ordered queue. Its monthly wrap-ups include summaries, cover collages and a reading calendar. These are useful precedents for reducing choice friction and making recorded reading satisfying to revisit.

**ReadSync adaptation:** save useful library views, optionally add a small personal rotation later, and create a monthly replay that celebrates progress through ongoing serials. A book-finished-only retrospective would miss much of a web-novel reader's activity.

Sources: [Up Next](https://roadmap.thestorygraph.com/changelog/up-next-and-suggestions), [monthly wrap-ups](https://roadmap.thestorygraph.com/changelog/monthly-wrap-ups-).

### Readwise Reader: organisation, capture and separate reading position

Readwise supports saved filtered views that can be pinned, passage capture, and a distinction between reading progress and current location. Its Ghostreader assistant offers contextual questions and lookups.

**ReadSync adaptation:** reuse existing filters, make saving a passage possible where reading occurs, and provide an explicit way to browse without changing the reading bookmark. Contextual AI is a later possibility once suitable source material exists.

Sources: [filtered views](https://docs.readwise.io/reader/docs/faqs/filtered-views), [progress and location](https://docs.readwise.io/reader/docs/faqs#what-do-the-colors-on-the-progress-bar-mean), [Reader](https://readwise.io/read), [Ghostreader](https://docs.readwise.io/reader/guides/ghostreader/overview).

### LNReader: the reading surface matters

LNReader presents immersive reading, personal themes, categories, offline reading and source plugins as central features.

**ReadSync adaptation:** narrow font, spacing, width and auto-scroll controls can improve every reading session. Its broad source ecosystem is not a reason for a solo builder to maintain equivalent integrations.

Source: [LNReader](https://www.lnreader.app/).

### Mihon: selective updates

Mihon's smart updates use conditions such as whether a series has been started, is ongoing, has unread chapters and is due for another update. The mechanism aims to reduce unnecessary source requests.

**ReadSync adaptation:** use personal reading intent to decide which titles deserve attention. A binge threshold is our proposed adaptation, not a claim that Mihon implements the same feature. ReadSync can evaluate thresholds from existing browser refresh results without predicting release dates.

Source: [Mihon smart updates](https://mihon.app/docs/faq/updates/smart).

### Kindle: remembering a story is a real product direction

Amazon describes Recaps, position-aware Story So Far refreshers and Ask this Book for supported titles. Availability is restricted by product, region and title; this research is about the interaction rather than recommending access from the UK.

**ReadSync adaptation:** make your own saved story context easier to retrieve. Automatic plot summaries need chapter content and dependable boundaries; progress numbers and a synopsis cannot supply them.

Source: [Kindle reading features](https://www.aboutamazon.com/news/books-and-authors/kindle-recaps-feature-ebook-series-refreshers).

### Hardcover and NovelUpdates: useful context, selective borrowing

Hardcover's public requests include a combined place for journal quotes and chapter-oriented journal entries. These are individual examples of a retrieval and context problem. NovelUpdates' Series Finder exposes genre/tag and release-related filters.

**ReadSync adaptation:** chapter context belongs with captured passages, and existing library filtering is valuable enough to preserve across visits. Social features, a universal catalogue and recommendation systems offer less obvious value for this single-user project.

Sources: [Hardcover quote collection request](https://roadmap.hardcover.app/feature-requests/posts/separate-quotes-highlights-from-the-rest-of-the-reading-journal), [chapter-oriented journal request](https://roadmap.hardcover.app/feature-requests/posts/reading-journal-select-chapter-or-free-text-field-), [NovelUpdates Series Finder](https://www.novelupdates.com/series-finder/).

## 5. Existing decisions and roadmap contradictions

The current backlog mixes accepted work with later brainstorms. Historical decisions should remain visible so that a renamed proposal does not quietly override an earlier preference.

| Item | Historical position | Treatment in this document |
| --- | --- | --- |
| Reading Wrapped | Accepted/deferred with coverage caveats | Rescope to a monthly replay; no December dependency |
| Reading personality | Accepted and linked to Wrapped | Combine into replay instead of another destination |
| Time Machine | Open signature proposal | Consider later as a replay interaction, not a parallel historical data system |
| Ambient second-screen companion | Accepted, design incomplete | Keep the accepted informational display shape |
| Accessible reader overlay | Accepted/unscoped | Narrow comfort proposal remains a valid candidate |
| Full reader mode | Previously declined in Proposal Gateway #09 | Do not treat a complete reader replacement as approved |
| Unified search | Previously declined in Proposal Gateway #08 | Scope passage retrieval separately; broad search needs a fresh preference decision |
| Standing goals | Previously declined, later reintroduced | Exclude from recommended Next list |
| Shelf recommendations | Previously declined, later reintroduced | Prefer owner-selected views and thresholds |
| Finish ETA / catch-up countdown | Previously declined | Exclude; current time data also limits precision |
| Since-you-left / reading digests | Prior versions declined; newer variants listed | Do not introduce a scheduled notification system by default |
| Spoiler-gated notes | Previously declined | Do not quietly add automatic note gating under a new name |
| Conflict history | Accepted only with manual resolution | A passive conflict log alone would miss the accepted requirement |
| NovelUpdates bridge | Accepted/unscoped | Keep later, dependent on actual need and an integration feasibility check |
| Mirror/duplicate detector | Parked | Revisit when real duplicates justify it |

References: [Proposal Gateway decisions](../changelog/2026-08-proposal-gateway.md), [full decision history](../changelog/2026-08-level-up.md), [current roadmap](../ROADMAP.md).

Other stale assumptions to avoid:

- The batch-import spec references deleted bot/Puppeteer code. It is not a cheap reuse opportunity today.
- Dead-novel detection assumes observations from a functioning monitoring system. No observed update is not proof that a novel was abandoned.
- `chapters_updated_at` reflects refresh/update activity, not a dependable publication history. Do not substitute it for the site's publication timestamp.
- The companion's former scanning state depended on removed bot functionality.
- Earlier sparse-history analysis claimed a database wipe. The current roadmap correctly withdraws that inference: sparse records and sequence gaps do not establish their cause.

## 6. Detailed feature proposals

### 6.1 Saved views and Explorer quick actions

**Classification:** new persistence above existing filters; previously documented usability work for Explorer actions.  
**Why first:** quick daily payoff with little new infrastructure.

#### User experience

Choose a combination such as "fantasy, exclude harem, currently reading, favourites first." Navigate to a novel and back without losing it. Bookmark that view. In a later slice, save it under a name and access it from a small list of personal views.

Explorer cards should expose enough information to act: current chapter, status and a Continue action. This addresses the documented mismatch between browsing in Explorer and understanding progress in My List.

#### Smallest useful release

1. Put supported filter, sort and view state into URL search parameters.
2. Initialise controls from that URL and keep browser Back/Forward behaviour coherent.
3. Add progress/status context and an accessible Continue action to Explorer cards.
4. Use browser bookmarks until named in-app views provide a clear additional benefit.

Then, if useful, add names and cross-device storage. Save definitions, not frozen result lists: newly matching novels should appear automatically.

#### Existing foundations and proposed changes

Reuse [Explorer](../../frontend/src/pages/Explorer.tsx), [Explorer filters](../../frontend/src/lib/explorerFilters.ts), [novel sorting](../../frontend/src/lib/novelSort.ts), [My List](../../frontend/src/pages/MyList.tsx) and existing resume-link helpers.

The first slice needs no database change. For synced named views, the existing `user_settings` table can hold bounded JSON. The current [preferences routes](../../src/routes/settings.ts) only accept allowlisted scalar preferences; arbitrary saved-view JSON is **not** supported today. Add a dedicated validated contract if this later slice is built.

A card currently structured as one link must be restructured before adding separate buttons. Do not nest interactive actions inside that link. Controls must also work without hover on touchscreens and keyboards.

#### Acceptance checks

- Reloading or bookmarking a URL reproduces the selected view.
- Browser Back restores previous filters instead of unexpectedly resetting them.
- Invalid or outdated parameters fall back safely.
- Continue opens the existing saved location; it does not alter progress by itself.
- Keyboard and touch users can access the same actions as mouse users.
- A saved view updates its results after relevant library changes.

**Defer:** a custom query language, recommendation scoring, a visual rule builder and elaborate sidebar customisation.

**Expand when:** you repeatedly reuse several distinct combinations or need them available on multiple devices. Otherwise URL state alone may be enough.

### 6.2 Monthly Reading Replay

**Classification:** rescope of Wrapped; consolidation with personality/Time Machine ideas.  
**Why build:** strongest opportunity for a signature feature using data already collected.

#### User experience

Select a month and see a short visual account of your reading: covers of novels you spent time with, active reading dates, notable recorded chapter stretches, and titles you returned to. Optionally include a passage you deliberately selected as a favourite.

The emphasis is on ongoing reading, because finishing a very long serial may be rare. A month can be memorable without a single completed novel.

#### Smallest useful release

- One page with a calendar-month selector.
- A cover montage and day-by-day reading view.
- A small number of statements supported by recorded data: titles visited, recorded reading days and observed chapter ranges.
- Started/completed titles only where the recorded dates support the claim.
- Clear covered-period and estimated-time wording.
- A print-friendly layout; automatic image generation can follow later.

Use titles and dated events to tell the story. Do not add every existing chart just because it is available.

#### Existing foundations and proposed changes

Reuse [daily stats](../../src/routes/stats.ts), [History routes](../../src/routes/history.ts), [History UI](../../frontend/src/pages/History.tsx), [ActivityHeatmap](../../frontend/src/components/ActivityHeatmap.tsx), [ReadingTimeline](../../frontend/src/components/ReadingTimeline.tsx) and existing covers.

Daily stats already accept explicit dates. History's trailing-day interface is not sufficient for arbitrary past months. Add either date-range support or one bounded replay aggregation. The initial feature does not require a new table.

Compute summaries in PostgreSQL and return small results. Do not fetch the complete snapshot history into Node to build a montage. Fetch the selected month on demand, not on every scroll-driven socket event.

#### Definitions to settle before implementation

- A month uses an explicit timezone and a half-open interval: start of month through, but excluding, start of the next month.
- A recorded chapter visit is not proof the whole chapter was read.
- A jump from chapter 100 to 200 does not prove that all intervening chapters were read.
- Decide whether repeat visits and separate read-throughs are distinct measures; label them accordingly.
- Dates of snapshots and manual corrections can affect the apparent story. Do not describe current mutable metadata as a complete historical event log.
- A return-after-a-break statement requires evidence of activity before and after the gap. Absence of records can also reflect incomplete tracking.

#### Acceptance checks

- Calendar boundaries, February, leap years and daylight-saving changes do not misplace records.
- Empty and partially recorded months have honest, useful states.
- Offline uploads are not presented as exact original reading dates.
- Corrections and chapter jumps do not manufacture impressive reading totals.
- Export/print remains legible on a narrow screen and on paper.
- The response stays bounded as lifetime history grows.

**Defer:** animated scrubbing of the whole lifetime library, inferred personality labels, exact active-minute claims and separate Wrapped/personality/Time Machine pages.

**Expand when:** you revisit the replay after the first month. The next useful addition might be comparing months or selecting favourite moments, rather than more charts.

### 6.3 Per-novel binge thresholds

**Classification:** new personal shelving rule above the existing fixed Behind 5+ filter.  
**Why build:** expresses intentional waiting, a particularly good fit for serial fiction.

#### User experience

"I am at chapter 620. Show this in my ready shelf when there are 30 chapters waiting."

The novel shows `18 / 30 accumulated`, then appears as ready after an existing refresh observes enough chapters. It can remain on hold; readiness should not silently change its reading status.

#### Smallest useful release

- An optional positive chapter threshold per novel.
- A ready/not-ready indicator and a personal ready shelf.
- The observation/refresh date alongside the count.
- A way to change or remove the threshold.
- No new scheduled scraper or notification delivery system.

#### Proposed model and semantics

Add a nullable, bounded positive integer such as `binge_threshold_chapters` to `user_novel_meta`, exposed through the appropriate existing novel read/update contracts. This field does not exist today.

Derive readiness from current progress and the latest observed chapter count. Reuse [behind-count semantics](../../frontend/src/lib/behindStatus.ts) where appropriate rather than introducing a subtly different calculation.

Recommended first-version interpretation: the threshold applies to the **current unread chapter backlog**. If you read some chapters, the backlog decreases. "Thirty releases since I paused, irrespective of reading" is a different rule requiring a stored baseline; do not mix the two meanings.

Do not count the unfinished part of the current chapter as a whole newly waiting chapter. An unknown latest count means readiness is unknown, not zero. If latest metadata regresses or is stale, reflect that uncertainty instead of manufacturing confidence. Known source counts also do not necessarily prove every chapter is currently accessible.

If implemented, include the new preference in export/import validation and restoration. A new metadata column is not automatically a finished recovery feature simply because export serialises rows.

#### Acceptance checks

- Readiness changes correctly immediately below, at and above the threshold.
- Unknown counts and missing progress do not produce false ready states.
- Reading progress, corrections and rereads recalculate the shelf coherently.
- On-hold titles remain on hold until the owner changes them.
- The display states when its source count was last observed.
- Restore preserves the setting and subsequent readiness behaviour.

**Defer:** release-date prediction, update-cadence modelling, automatic status changes and push alerts. If alerts are later desired, notify on meaningful threshold crossings with deduplication, not every time a ready novel refreshes.

**Expand when:** you actually park several novels to accumulate chapters. If that is uncommon, saved views may cover the need without a new field.

### 6.4 Explicit browsing without moving the bookmark

**Classification:** new explicit mode; backward-peek protection already exists.  
**Why build:** complements the app's core promise of preserving the right reading position.

#### User experience

Activate "Browsing — progress paused" before looking around. Open an older chapter, inspect a later one, or look up a reference. Your normal reading position stays intact. Choose either "Return to saved position" or "Continue reading from here" when finished.

This is different from the existing quiet-peek banner. The current max-progress policy protects against backward updates, but an ordinary accepted forward update can still advance progress. The new value is deliberate control over tracking while exploring.

#### Smallest useful release

- One explicit control with a persistent, understandable state indicator.
- Scope the pause to a clearly defined browser context, initially the current tab and novel.
- Suppress new reading-progress writes while that mode is active.
- Provide a route back to the saved reading location.
- Resume ordinary tracking through an explicit action.

State lifetime across full-page chapter navigation needs to be designed, not assumed: the userscript can restart on navigation. Keep the pause visible after applicable navigation, and prevent it from silently disabling unrelated reading indefinitely. Avoid a global account pause unless that behaviour is specifically wanted.

#### Existing foundations and required care

Relevant files are [userscript main](../../userscript/src/main.ts), [ProgressSync](../../userscript/src/services/ProgressSync.ts), [OfflineQueue](../../userscript/src/services/OfflineQueue.ts), [UIManager](../../userscript/src/services/UIManager.ts) and [ProgressPolicy](../../src/services/ProgressPolicy.ts).

Trace every write path: debounced scroll updates, completion fast paths, heartbeat catch-up, final/unload sync, local restore state and offline enqueue/replay. A UI-only toggle that blocks one caller is incomplete. Cancel pending work where possible and distinguish a request already sent before the pause from new browsing activity.

Do not discard legitimate queued reading from before the pause. Define when it may replay, while ensuring browsing itself never adds progress that will be uploaded later. Viewing metadata can remain separate from changing reading progress.

"Continue from here" must respect existing reset/reread semantics. Choosing an earlier location should not silently create a reread or bypass the correction policy.

#### Acceptance checks

- Browsing ahead cannot advance the saved position through any sync path.
- Reload, chapter navigation and closing the tab do not leak browsing progress.
- Previously queued legitimate reading is preserved.
- Resuming tracking behaves correctly at earlier, same and later locations.
- A second device's genuine reading is not overwritten by stale tab state.
- An obvious indicator prevents accidental long periods with tracking paused.

**Defer:** automatic detection of whether someone is reading versus skimming, new conflict algorithms and a general event-sourcing rewrite.

**Expand when:** browsing ahead or checking references actually causes unwanted progress. It is a core safety feature, but testing makes it larger than a simple toggle.

### 6.5 Ambient companion screen

**Classification:** accepted existing proposal, still unbuilt.  
**Why build:** a contained feature that can be enjoyable purely as a personal display.

#### User experience

A spare screen shows the current novel's cover, title, chapter and percentage. When updates stop, it becomes a calm recently-read or idle display. It does not claim to know the plot or require reading chapter text inside ReadSync.

Preserve the accepted concept: an ambient status display. An on-page notes panel is another possible feature, but it should not silently replace this existing decision.

#### Smallest useful release

- A dedicated view using the existing authenticated frontend.
- Seed it from current saved progress, clearly labelled as saved/recent activity.
- Update it from the existing socket rather than creating a new polling channel.
- Use a simple inactivity timeout to transition to idle.
- Show disconnection separately from idle.
- Offer fullscreen through ordinary browser capability if useful.

Reuse [useSocket](../../frontend/src/hooks/useSocket.ts), [Layout's realtime handling](../../frontend/src/components/Layout.tsx), [Dashboard](../../frontend/src/pages/Dashboard.tsx) and [progress events](../../src/routes/progress.ts).

Recent sync activity is an approximation of presence. Someone can be reading a long paragraph without generating a new progress event. Use wording such as "Recently active" rather than implying precise attention tracking.

The removed bot cannot supply the former "now scanning" state. Do not add a monitoring subsystem just to fill idle space. Likewise, an accurate session timer is a separate data problem; title and location are sufficient for the first release.

#### Acceptance checks

- The view works on first load, after reconnect and after a novel change.
- Idle and disconnected states are visibly different.
- It reuses the shared socket and does not refetch the whole library for every update.
- Logout removes authenticated access and live updates.
- Long titles, missing covers and reduced-motion preferences are handled.

**Defer:** precise presence detection, synchronised timers, hardware integrations and elaborate idle animations.

**Expand when:** you leave the view open while reading and enjoy it. If you have no practical display for it, its priority should fall.

### 6.6 Narrow reader-comfort controls

**Classification:** extension of current userscript tools, aligned with the accepted accessible overlay. Full reader mode was separately declined.

#### User experience and first release

Adjust font size, line spacing, text width and existing auto-scroll speed on the supported sites. Remember the preferences and provide an easy reset. A reversible focus treatment or a small theme choice can follow if wanted, without replacing the site's whole reader.

The userscript already supplies keyboard navigation and auto-scroll. The first benefit is making those tools more comfortable and configurable. Do not present auto-scroll itself as missing.

Use [userscript main](../../userscript/src/main.ts), [configuration](../../userscript/src/config.ts), [UIManager](../../userscript/src/services/UIManager.ts) and existing site/content detection. Browser-local preferences are a valid first step; cross-device preference sync requires a suitable authenticated settings contract rather than assuming the SPA's current preferences endpoint fits the userscript.

#### Main implementation risk

Changing fonts and width changes layout and therefore the meaning of scroll percentage. The app must apply the intended layout before restoring position where possible, avoid treating layout movement as newly read progress, and test switching preferences mid-chapter. Third-party site CSS and SPA navigation are the ongoing maintenance surface.

#### Acceptance checks

- Controls work on the supported source layouts and narrow screens.
- Reset restores normal source-page behaviour.
- Adjusting layout does not unexpectedly advance the saved bookmark.
- Preferences survive the agreed browser/navigation lifetime.
- Keyboard focus and text remain usable in both normal and focus states.
- Hidden site controls remain recoverable when focus mode is disabled.

**Defer:** a standalone content renderer, automatic theme scheduling, many preset themes and support for unrelated websites.

**Expand when:** a specific comfort setting improves actual reading. A full replacement reader should be a new product decision, not an unnoticed consequence of adding font controls.

### 6.7 Passage capture and retrieval

**Classification:** existing open capture/highlight direction; reuse dormant API support. Broad unified search was previously declined.

#### User experience

Select a passage on a chapter page, save it, and later see it with the novel and source location. The useful loop is capture, revisit and retrieve. The first release does not need to repaint the exact highlight inside a source page.

#### What exists versus what does not

[Bookmarks](../../src/routes/bookmarks.ts) already support `highlight` as a type, a chapter URL, percentage, title and free-text note. The frontend has API wrappers but no corresponding capture/browsing workflow in the reviewed code. This is not a separate highlights table or an implemented text-anchoring engine.

There is no dedicated selected-quote field, character range or stable DOM anchor. The unique constraint on user, novel, URL and percentage can also collide when saving different passages at the same scroll position.

#### Smallest useful release

1. Save selected text through the existing bookmark API with a source link.
2. Display saved passages on the novel page or a simple collection view.
3. Show save failures and duplicates explicitly.
4. Add limited passage filtering/search when the collection is large enough to need it.

For a prototype, the selected text can occupy the existing note field. If both a verbatim quote and personal annotation are needed, introduce distinct fields deliberately. Define handling for same-position selections before calling this robust multi-highlight support. Use the actual existing text limits and server validation rather than assuming arbitrary chapter-length input is acceptable.

Relevant files: [frontend API](../../frontend/src/api/client.ts), [userscript API](../../userscript/src/api/client.ts), [UIManager](../../userscript/src/services/UIManager.ts), [NotesPanel](../../frontend/src/components/NotesPanel.tsx), [bookmark routes](../../src/routes/bookmarks.ts).

#### Optional return-to-story card

A resume card could link to recent notes or a chosen favourite passage. This is useful if you already write notes; it should not become an empty permanent panel otherwise.

Automatic filtering "up to your chapter" is not automatically spoiler-safe: notes may have no chapter, contain information from later chapters, or come from a previous reread. Notes also lack read-through identity. Because spoiler-gated notes were previously declined, treat automatic gating as an explicit separate decision. A simple user-opened notes link or manually pinned reminder avoids silently changing note visibility.

#### Acceptance checks

- Saved passages are escaped text and retain their source link.
- Failed saves do not look successful or lose the user's selected text without recourse.
- Duplicate-position behaviour is clear.
- Long passages respect storage and request limits.
- Novel-scoped and collection views do not fetch all passage text in the normal library payload.
- Export and restore preserve captured material.

**Defer:** precise inline re-highlighting after source edits, full-text chapter search, a new search service and cross-library semantic search.

**Expand when:** you accumulate enough passages that retrieval is a real frustration. Capture must earn regular use before a broad notebook/search product is justified.

### 6.8 Personal glossary and story memory

**Classification:** older brainstorm worth retaining as an experiment, not a new accepted commitment.

The appealing question is "Who is this character again?" or "Are these two spellings the same technique?" This can matter in long and inconsistently translated novels.

#### Manual prototype

Start with your own short per-novel character/term notes and an easy way to open them while reading. An alias list and a source chapter reference can make the notes more useful. Existing notes can test the habit before introducing structured entities or automatic extraction.

Do not make a glossary system just because the data model can support one. Use it on a few novels and see whether it reduces the mental effort of returning to them.

#### Automated version: separate, larger scope

ReadSync does not store a chapter-text corpus. Automatic summaries, character extraction and grounded question answering would require:

- Explicitly captured source text or selected excerpts with reliable chapter identity.
- A defined information boundary for the requested reading position.
- Source references so the owner can check the answer.
- Handling for missing chapters, changed translations, rereads and conflicting names.
- Storage, deletion, export and restore behaviour for the new material.
- A bounded processing strategy and an understood model/runtime cost.

A prompt saying "do not spoil" is not a substitute for those foundations. Even restricted retrieved material does not justify an absolute spoiler-free guarantee from a model that may know other information. Selected excerpts support answers about those excerpts; they do not establish complete knowledge of a novel.

**Defer:** automatic full-library recaps, a dedicated model service, chapter archival and a graph of characters until the manual workflow proves useful.

**Expand when:** you repeatedly need the memory aid, have suitable source material and want the larger engineering project for its own sake.

## 7. Data quality and recovery requirements

These constraints matter directly to the proposed experiences. They are not a requirement to finish a general infrastructure programme before shipping anything enjoyable.

### 7.1 What current time measurements mean

[ProgressSync](../../userscript/src/services/ProgressSync.ts) sends elapsed page time. This can include time when the page was not actively being read. The backend's [session tracking](../../src/routes/progress.ts) advances sessions on accepted progress and uses a 30-minute inactivity threshold. Stale sessions are closed when subsequent accepted activity triggers that logic; the threshold is not a precise independent attention timer.

The pace endpoint already uses bounded per-chapter dwell samples, but these are still estimates. Many statistics include only closed sessions, so currently active reading can appear later.

**Product consequence:** use "estimated session time" where appropriate. Do not infer fatigue, attention, exact time-to-finish or a precise session timer from the existing measurements.

### 7.2 Offline chronology

[OfflineQueue](../../userscript/src/services/OfflineQueue.ts) stores `queued_at` locally but replays the progress payload without an original observation timestamp. The server dates the resulting snapshot when it arrives. The queue is also bounded and coalesces entries, so it is a recovery mechanism for progress rather than a complete offline activity ledger.

**Product consequence:** a replay must acknowledge that offline reading can appear on the upload date. If chronology becomes important, a future validated `observed_at` can improve new records while retaining server write time for ordering and audit purposes. It cannot reconstruct missing historical facts automatically.

### 7.3 Chapter counts, rereads and corrections

The current daily query counts distinct novel/chapter pairs with snapshots. It does not require a completed-chapter percentage, and its distinct key does not separate read-throughs. A chapter span can include unobserved intermediate chapters. Manual adjustments can also create snapshots that influence analytics.

**Product consequence:** use observed visits/ranges until a stronger metric is defined. Do not reuse an endpoint's field name as proof of its meaning. Keep saved reading progress, browsing location and completed reading as separate concepts in the feature design.

### 7.4 Metadata freshness

Latest chapter count, refresh time and site publication time answer different questions. Some source observations are missing or stale. Browser refresh is not continuous monitoring, and a visible chapter count may not establish accessibility of every chapter.

**Product consequence:** display what is known and when it was checked. No new observation means unknown freshness, not a dead novel. Binge readiness is based on observed backlog, not a guaranteed live release feed.

### 7.5 Historical coverage

The roadmap records sparse early data and some historically empty months. Those are past observations, not a fresh database inspection. The cause is not established by the gaps.

**Product consequence:** show the selected/recorded range, support partial coverage and avoid claiming a complete lifetime history. An empty month does not automatically mean the owner stopped reading.

### 7.6 Library backup versus historical backup

The [compact export scope](../../src/services/ExportService.ts) used for automatic library backups omits sessions and notifications and retains selected current progress rather than all snapshots. It preserves important library data, including notes, bookmarks and categories.

Full user export includes detailed history; the [full-database backup guide](../BACKUPS.md) describes a separate workflow. These are different recovery products, and a raw database dump is not the same format as the app's JSON import.

**Product consequence:** a beautiful lifetime replay depends on data absent from compact automatic backups. Keep the compact backup memory fix; protect detailed history through an appropriate full-history recovery workflow. Verify restoration in isolation rather than treating the existence of a file as proof of recoverability.

### 7.7 Performance boundaries

The project has a documented history of expensive repeated queries and egress surprises. New features should:

- Use existing library data for saved views and readiness where practical.
- Fetch notes/passages only when needed, not inside every novel-list response.
- Aggregate replay data in PostgreSQL and return bounded summaries.
- Reuse existing socket connections and cache updates.
- Avoid new background source polling just to support a badge.
- Make large text capture a separate capacity decision.

These constraints favour small, useful features; they do not require GraphQL, a queue service or a second backend.

## 8. Build sequence and healthy project rhythm

### Phase 0: a bounded foundation check

Before a history-dependent feature, establish what recovery coverage exists and what the displayed metrics mean. Verify relevant existing fixes in their actual environment if needed. Keep this a limited maintenance task with a clear finish, not an indefinite blocker for product work.

The current research does not establish production deployment, quota status or successful full-history restoration.

### Phase 1: make browsing easier

Build URL-preserved views and Explorer actions. Use them for a week. Add named cross-device views only if URL bookmarks or local persistence fall short.

**Done when:** you can return to the library in the same useful state and resume a novel directly from where you browse.

### Phase 2: ship one signature experience

Build Monthly Reading Replay using a bounded month, explicit metric definitions and existing visual components. Prefer one polished page over three incomplete retrospective destinations.

**Done when:** you can open a month, understand the data's limits, enjoy the reading record and print/save the view if desired.

### Phase 3: add personal binge readiness

Build the threshold and shelf without scheduled notifications. Try it on the few titles you actually pause to accumulate chapters.

**Done when:** readiness changes from your observed library data and helps you decide when to return.

### Phase 4: select by actual friction or enjoyment

Choose one of:

- Browsing mode if exploring chapters threatens your saved position.
- Comfort controls if typography or auto-scroll is the daily irritation.
- Ambient companion if a second display would be enjoyable.
- Passage capture if you already want to keep memorable lines.

These are alternatives at this stage, not a requirement to build all four.

### Working rules for a solo project

1. Keep at most three concrete items in **Next**. Put experiments and older possibilities in **Later**.
2. Pair one everyday improvement with one enjoyable signature feature.
3. Finish a usable vertical slice before adding its settings, integrations and variants.
4. Leave a short period of real use between a first version and expansion.
5. Record what was deliberately deferred and the condition that would justify it.
6. Preserve declined decisions. A new framing is not automatic approval.
7. Avoid precise calendar promises for untested source-page behaviour or history corrections.

### Personal success checks

No analytics SDK is needed. After using a feature, ask:

| Feature | Evidence it earned its place |
| --- | --- |
| Saved views | You return to the same view without rebuilding filters |
| Explorer actions | You resume books directly from browsing |
| Replay | You deliberately revisit a month after the initial demo |
| Binge shelf | It helps you choose when to return to parked novels |
| Browsing mode | You inspect chapters without later repairing progress |
| Comfort controls | You keep a setting because reading feels better |
| Companion | You leave it visible during real reading sessions |
| Passage capture | You save and later retrieve passages, rather than only testing it once |

## 9. What to defer

| Proposal | Why it is not in Next | Condition for reconsidering |
| --- | --- | --- |
| GraphQL alongside REST | No identified reading workflow requires another API surface | An actual client/query problem that existing REST cannot reasonably solve |
| CRDTs | Current max-progress/reset/reread rules are concrete domain behaviour | A demonstrated conflict requirement that those rules cannot handle |
| Extension migration | Packaging does not itself add the missing reading benefit | A userscript limitation that materially blocks a wanted workflow |
| Full offline reader/PWA | Offline progress queue exists; offline chapter reading is a different and much larger scope | A recurring need to read content without network access |
| More source sites | Identity, access, numbering and DOM differences create continuing maintenance | You regularly read a specific unsupported source and accept the integration work |
| Revived server scraper | Old bot code was removed; production-network restrictions were documented | A fresh, viable source-access design and a clear need |
| Automatic dead-novel triage | Incomplete observations cannot reliably establish abandonment | Reliable observation history and owner-controlled review actions |
| Social/public features | Limited benefit for the stated solo use | An explicit change in how the app will be used |
| Goals/recommendations/ETAs | Previously declined and some depend on stronger data | A fresh owner decision, with the new need clearly stated |
| Broad search | Historical preference conflict; ordinary novel search already exists | Enough saved personal material to create a retrieval problem |
| AI plot assistant | Missing chapter corpus, boundaries and grounding | Successful manual memory workflow plus deliberate content-pipeline scope |
| NovelUpdates two-way bridge | Accepted idea, but ongoing external integration has a cost | Real duplicate list maintenance and verified integration feasibility |
| CLI or raw API explorer | Useful developer tooling only if it serves recurring work | A repeated task the existing UI/API tools make painful |

This is prioritisation for the current use case, not a claim that those technologies are inherently inappropriate.

## 10. Combined conclusions from the three agents

### Reader-experience review

The strongest opportunities connect existing tools: save library state, activate passage capture, make accumulated chapters personal, and present historical activity attractively. It confirmed that auto-scroll, backwards peek protection, smart filters and many analytics features already exist.

Its proposed quick win was saved views, followed by return-to-story notes/capture and monthly replay. It also identified source-layout changes as a real risk for reader controls and distinguished excerpt storage from restoring inline highlights.

### Backend/data review

The backend has enough primitives for named views, thresholds, selected-passage storage and replay. New source ingestion is unnecessary for those versions. It emphasised that time is estimated, offline dates reflect arrival, daily chapter counts are not verified completions, and compact backups omit detailed history.

It proposed using existing notes for a return-to-story card and existing bookmarks for initial passage capture. Its chapter-filtering suggestion is technically feasible but needs to respect the earlier decision against spoiler-gated notes.

### Roadmap/history review

The main issue is not a shortage of ideas. Accepted, rejected, stale and overlapping proposals coexist. It identified full reader mode and unified search as previously declined, challenged deleted-bot reuse assumptions, and recommended combining Wrapped/personality/Time Machine work.

Its priorities were replay, library usability, binge thresholds, explicit browsing and the accepted ambient companion.

### Final synthesis and corrections to the initial answer

- Move **saved views/Explorer actions** into the first practical build, followed by **Monthly Replay** as the signature feature.
- Keep **binge thresholds** as the strongest new serial-reading addition.
- Narrow **reader modes** to the accepted comfort/accessibility direction unless the owner revisits the full-reader decision.
- Treat **passage capture** and **unified search** separately; storage support exists, but the broad search decision is unresolved.
- Retain the accepted **ambient companion** concept rather than replacing it with a different on-page panel.
- Describe **browsing mode** as an extension of existing protection, with a complete write-path review.
- Preserve the **full-history backup distinction** before promising durable lifetime replay.

## 11. Source index

### Project decisions and implementation

- [Current roadmap](../ROADMAP.md): open work, accepted proposals, history caveats and source-support constraints.
- [Architecture](../ARCHITECTURE.md): runtime, authentication, browser refresh and removed bot.
- [Historical proposal gateway](../changelog/2026-08-proposal-gateway.md): dated decision evidence, not current implementation truth.
- [Full August decision history](../changelog/2026-08-level-up.md): declined ideas and older brainstorms.
- [Older detailed feature specs](./future-specs.md): useful context with stale bot and schema assumptions.
- [September 12 changelog](../changelog/CHANGELOG-2026-09-12.md): implementation history subsequently changed by later commits.
- [Backup guide](../BACKUPS.md), [ExportService](../../src/services/ExportService.ts), [ImportService](../../src/services/ImportService.ts): recovery formats and implementation.
- [Initial schema](../../src/db/migrations/001_initial_schema.sql), [migrations](../../src/db/migrations): data foundations; later migrations refine initial definitions.
- [Frontend pages](../../frontend/src/pages), [userscript services](../../userscript/src/services), [API routes](../../src/routes): reviewed code locations.

### External product research

- [StoryGraph Up Next](https://roadmap.thestorygraph.com/changelog/up-next-and-suggestions).
- [StoryGraph monthly wrap-ups](https://roadmap.thestorygraph.com/changelog/monthly-wrap-ups-).
- [Readwise filtered views](https://docs.readwise.io/reader/docs/faqs/filtered-views).
- [Readwise reading progress and location](https://docs.readwise.io/reader/docs/faqs#what-do-the-colors-on-the-progress-bar-mean).
- [Readwise Reader](https://readwise.io/read).
- [Readwise Ghostreader](https://docs.readwise.io/reader/guides/ghostreader/overview).
- [LNReader](https://www.lnreader.app/).
- [Mihon smart updates](https://mihon.app/docs/faq/updates/smart).
- [Kindle Recaps, Story So Far and Ask this Book](https://www.aboutamazon.com/news/books-and-authors/kindle-recaps-feature-ebook-series-refreshers).
- [Hardcover quote-collection request](https://roadmap.hardcover.app/feature-requests/posts/separate-quotes-highlights-from-the-rest-of-the-reading-journal).
- [Hardcover chapter-oriented journal request](https://roadmap.hardcover.app/feature-requests/posts/reading-journal-select-chapter-or-free-text-field-).
- [NovelUpdates Series Finder](https://www.novelupdates.com/series-finder/).

External pages can change after the research date. Before implementing an integration or relying on a provider capability, verify that specific current contract. Most proposed first versions above depend only on ReadSync's own data and interfaces.
