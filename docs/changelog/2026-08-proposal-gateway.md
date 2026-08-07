# Proposal Gateway — consolidated from the two earlier 30-item docs

Working doc, not the final artifact. Source: the original 30 "SSS Features"
(`claude.ai/code/artifact/5deda974`) cross-referenced against the build-report
status of those 30 plus its 9 new ideas
(`claude.ai/code/artifact/7a3f30bc`). Everything **Shipped** or **Retired** is
removed — it's done, not a live proposal. Everything that duplicated a
proposal you rated **N** in the most recent Field Audit
(`claude.ai/code/artifact/f2eafea6`) is also removed — you already said no to
the idea, just under different framing.

**Removed as already-declined (duplicates a Field Audit N):**
- ~~Spoiler-gated chapter notes~~ (original #17) — same concept as Field
  Audit #1 "Spoiler-tagged notes," which you rated N.
- ~~"Why I dropped it"~~ (original #20) — same concept as Field Audit #12
  "DNF reason capture," which you rated N.
- ~~Time-capsule notes~~ (build-report idea) — explicitly built on #17 above
  ("Is F17, with better framing"), so it falls with it.

**17 items survive.** Every description below is checked against the actual
codebase right now — what exists, what doesn't — not the original pitch
copy. Rate each Y / N / M when you're ready.

**Rated 2026-08-06:**
N — #01, #03, #04, #08, #09, #10, #11, #12, #13, #17
M — #02, #07
Y — #06 (confirmed — you'd already settled this via Field Audit #16: a star
control on the novel page, not a dropdown), #16 (conditional — only if the
logged conflict can be manually resolved from History, not just viewed)
Deferred, not rejected — #14 (mirror & duplicate detector — parked for
later, revisit once the library grows enough for it to matter)

**#05 (Reading Wrapped) — verified against production data:**
`progress_snapshots` row counts by month: Aug–Nov 2025 = 5 / 24 / 28 / 55
(consistent with "kept only the most recent snapshot per novel" — too
sparse to be real sync history), then Dec 2025 = 307, Jan 2026 = 32,955.
The wipe you remembered is confirmed in the data. A Wrapped covering a
recent window (last 3–6 months) would have rich data; a full "year in
review" would show almost nothing before December. Downgraded to M with
that scope caveat rather than a clean Y.

**#15 (reading personality page) — same data check, different table:**
`reading_sessions` has only 11 rows total, all from the past 3 days — it's
not a hardened history table yet, it was only just wired up. Building #15
purely off `reading_sessions` today would show close to nothing. You said
Y, connect with #05 — noted, and the fix is the same: derive the
personality metrics from `progress_snapshots` (63,489 rows, real history
since January) rather than `reading_sessions`, so it has real data behind
it from day one instead of waiting for `reading_sessions` to accumulate.

---

## From the original 30 — still Backlog or Specced, not built

### 01. Discord webhook / daily digest
**Right now:** zero Discord integration exists anywhere in the codebase —
no webhook URL config, no `discord` references at all. This would be built
from scratch.
**What it'd be:** you paste a Discord webhook URL into Settings once. A
scheduled job (same shape as the existing backup cron) posts a message to
that channel — either on every chapter-inflation event, or as one daily
roundup ("3 novels updated today, 12 chapters read"). One-way only: it
posts *to* Discord, nothing reads *from* it.
*Related to Field Audit #27 "Discord bot with slash commands," which you
rated N — that was a two-way bot answering `/readsync status` commands
inside Discord. This is one-way and much smaller: a webhook POST, not a
running bot process. Worth deciding if the whole Discord surface is off the
table or just the interactive-bot form of it.*

### 02. The stats page
**Right now:** the backend already has `/api/v1/stats/summary`,
`/api/v1/stats/library`, and `/api/v1/stats/daily` — all live, all queried
today, but only to feed six small number tiles at the top of the Dashboard
(Novels, Reading, Completed, Plan to read, Avg progress, Bookmarks,
Devices). There is no `/stats` route or page in the frontend at all.
**What it'd be:** a dedicated page — `Settings`-adjacent in the nav — that
actually uses `stats/daily`'s time-series data: a real chart of chapters
read per day/week, not just today's single number. The data collection
already exists; only the page that visualizes it doesn't.

### 03. Per-novel stats
**Right now:** the Novel page (`frontend/src/pages/Novel.tsx`) shows current
chapter, percent, and per-device last-read state — but no historical view:
no "you've read this novel over 14 sessions across 23 days" kind of number.
**What it'd be:** a stats panel on the novel page itself — time spent on
this specific novel, session count, your reading pace on it specifically
(chapters/day), pulled from `progress_snapshots` filtered to that
`novel_id`. Distinct from #02 (library-wide) — this is one novel's numbers.

### 04. Reading goals with pace indicator
**Right now:** no `goal` concept exists anywhere in the schema or backend —
fully unbuilt, zero infrastructure.
**What it'd be:** you set a target in Settings — "200 chapters this year" —
and a persistent bar (probably on the Dashboard) shows progress against it
with an on-track/behind indicator, computed from chapters read so far this
year vs. days elapsed vs. days remaining. Standing, always-on — not a
time-boxed challenge (that's a different, unlisted idea).

### 05. Reading Wrapped
**Right now:** unbuilt. The daily stats data that would feed it
(`stats/daily`) already exists and is already being written every day.
**What it'd be:** a once-a-year (or on-demand) summary screen — total
chapters read, top genres, longest streak, most-read novel, that kind of
thing — assembled from data that's already sitting in the database, just
never packaged into one view.

### 06. Ratings, on the scale you prefer
**Right now:** `rating` is a real column in `user_novel_meta` (checked
1-5, integer) and it's wired through the API and TypeScript types — but
grep for `rating` across the entire frontend finds **zero** UI usages. It
is not on MyList, not on the Novel page, not editable anywhere. The data
model exists; the control to set it does not.
**What it'd be:** wherever it ends up living, this is about *adding the
missing control*, not changing an existing one. Options: (a) widen the
scale to 0.5 increments while you're building the control anyway, since
touching the schema once is cheaper than twice.
*Directly relevant — you rated Field Audit #16 "Half-star rating scale" M
with this note: rating currently isn't a dropdown, isn't on MyList anyway,
and you're thinking the right place for it is the novel page as a star
control (a "rate" action plus N stars), not a form field. That confirms
the diagnosis above (there's genuinely no UI for it today) and gives a
concrete answer to "where": the novel page, not MyList, styled as clickable
stars rather than a dropdown or number input.*

### 07. Bookmarks & highlights, surfaced
**Right now:** the `bookmarks` table exists (columns for chapter_url,
percent, `bookmark_type` — position/highlight/note/favorite — title, and
free-text note) and Dashboard already shows a live "Bookmarks" count tile.
But the table currently has **0 rows** — there is no UI anywhere that lets
you *create* a bookmark, so the feature is invisible even though the count
tile is already there waiting for data.
**What it'd be:** a way to actually create a bookmark (probably from the
Novel page or the userscript overlay — "bookmark this spot") and a place to
browse them back (a new panel, or a tab on the Novel page). The schema
already supports four distinct types (position/highlight/note/favorite) —
this proposal is specifically about exposing what's already modeled.

### 08. Full-text search across everything
**Right now:** Explorer's search box (`frontend/src/pages/Explorer.tsx`) is
title-only, fuzzy-matched against novel titles in memory — it does not
touch notes, descriptions, or any other text field.
**What it'd be:** widen that search to also match against `novel_notes`
content and novel descriptions — so searching "cultivation" could surface a
novel whose *note* mentions cultivation even if the title doesn't. Would
need a real search index (Postgres `pg_trgm` or full-text `tsvector`,
neither currently in use) rather than the in-browser fuzzy match Explorer
uses today, since notes content isn't loaded client-side.

### 09. Reader mode on novelarrow
**Right now:** the userscript already injects a status bar onto every
novelarrow page (`document.createElement('div')` in `userscript/src/main.ts`,
toggleable via an `nb_overlay` localStorage preference) — but that bar only
shows sync status, not reading-experience controls. There's no font,
spacing, or theme override on the source page itself.
**What it'd be:** extends that *existing* overlay mechanism — not a new
injection system — to add reading controls: font-family override,
line-height/spacing slider, maybe a dark backdrop behind the source site's
own text. Runs entirely client-side in the userscript, no server changes.

---

## From the build report's "what the original list didn't ask for" — all new

### 10. Per-novel update cadence, not a flat hiatus timer
**Right now:** `HIATUS_DAYS = 90` is a single hardcoded constant in
`frontend/src/components/HiatusBadge.tsx`, applied identically to every
novel regardless of its actual release pattern. A novel that updates daily
and goes quiet for 10 days gets no warning; a novel that's always erratic
gets flagged constantly.
**What it'd be:** compute a rolling median gap between chapter releases per
novel, from its own `chapters_updated_at` history, and compare *that*
novel's current silence against *its own* normal cadence — "usually every
~4 days, it's been 11" instead of the same flat 90-day cutoff for
everything. Needs a new table to retain a release-date history per novel,
since currently only the single latest timestamp is kept.

### 11. Recommendations from your own shelf, not a stranger's algorithm
**Right now:** 132 novels with genre tags, favorite flags, ratings, and
completed/plan-to-read status are already sitting in Postgres
(`novel_categories`, `favorite`, `status`, `read_history` — all real
columns, all populated). Nothing currently reads across them to suggest
anything.
**What it'd be:** an offline query — no external API, no leaving
novelarrow scope — that cross-references genre/tag overlap between novels
you've completed-and-favorited against your Plan to Read pile: "you
finished four cultivation novels you starred; three plan-to-read titles
share that profile." Pure SQL over data you already have.

### 12. "Since you left" digest on login
**Right now:** `notifications`, `reading_sessions`, and auto-reread events
are all already written to the database on every relevant action — nobody
currently reads them back as a *summary*. The Dashboard shows current
state, not "what happened while you were away."
**What it'd be:** a single banner on first load after being away —
"since Tuesday: 14 chapters across 5 novels, streak at 6, 2 auto-rereads
started" — built from one aggregate query over data that's already being
recorded, surfaced once per session rather than buried in the History page.

### 13. Per-novel finish ETA
**Right now:** the Novel page shows current chapter and percent but no
projection. `progress_snapshots` has the timestamped history needed to
compute a pace.
**What it'd be:** given your recent read-rate on *this* novel and the
chapters remaining until `latest_chapter_num`, show "~18 days at your
current pace" next to the progress bar on the novel page. Smaller-scoped
than #04 (a per-novel estimate, not a library-wide annual goal) — the two
could ship independently or together.

### 14. Mirror & duplicate detector
**Right now:** `normalizeNovelId()` in `src/services/NovelService.ts`
derives a stable ID from a URL slug — but when a site migrates (as
happened with the novelbin→novelarrow move already handled this year), a
re-scraped novel can land under a *different* `novel_id` for what is
actually the same book, silently forking your progress across two rows.
Nothing currently detects this after the fact.
**What it'd be:** a background check — title similarity plus close
chapter-count matching across the `novels` table — that flags likely
duplicate entries and offers a one-click merge (combine progress history
under one novel_id) before you notice your library quietly doubled a
title.

### 15. A "reading personality" page
**Right now:** `stats/daily` and `reading_sessions` already record
enough to compute this (session timestamps, durations, chapters per
session) — nothing currently assembles it into a single view.
**What it'd be:** the always-on companion to #05 (Wrapped, which is
once-a-year) — busiest hour of day, weekday-vs-weekend split, session-length
trend, binge-vs-steady classification, all computed live from data already
being written, presented as one identity page rather than a yearly
snapshot.

### 16. Sync conflicts, visible in History
**Right now:** `GET /api/v1/compare` (in `src/routes/progress.ts`) already
runs every time you open a novel on a device — it compares this device's
last position against the furthest position on any device and returns
`should_prompt_jump: true` when they disagree (used by the userscript to
show a "jump ahead?" banner). That comparison happens live but is never
recorded anywhere — dismiss the banner and the fact that a conflict
happened is gone.
**What it'd be:** log the conflict event when `should_prompt_jump` fires
(one INSERT, the check itself already runs), and add a "conflicts" filter
to the existing History page timeline so you can see, after the fact, when
your phone and desktop actually disagreed about where you were — not just
in the moment the banner briefly appeared.

### 17. Installable, one-tap-to-reading
**Right now:** there is no `manifest.json` anywhere in the project — the
`/app` SPA is a plain webpage, not installable, confirmed by search.
**What it'd be:** add a `manifest.json` and two icon sizes so mobile
browsers offer "Add to Home Screen," and opening that home-screen icon
lands directly on the Continue Reading view instead of a browser tab. No
service worker, no offline caching — that's a separate, larger scope this
proposal deliberately excludes. Just the icon and the install prompt.

---

## Already logged elsewhere, not repeated here

- **Second-screen companion view** (Field Audit #29) — rated Y, already
  added as a TODO in `docs/LEVEL_UP_2026.md` from tonight's session.
- Field Audit items rated Y/M (#2, #13, #16, #21, #28, #29) stay in that
  document — they'll fold into the same final consolidation once this list
  gets its own Y/N/M pass.
