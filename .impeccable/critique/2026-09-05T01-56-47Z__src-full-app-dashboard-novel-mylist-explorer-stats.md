---
target: readsync frontend app (dashboard, novel, mylist, explorer, stats)
total_score: 25
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:/home/yoonis32/Code/readsync/frontend/src (full app: dashboard, novel, mylist, explorer, stats)"
timestamp: 2026-09-05T01-56-47Z
slug: src-full-app-dashboard-novel-mylist-explorer-stats
---
⚠️ DEGRADED: single-context (per stored feedback, screenshot-heavy per-route sub-agent audits are avoided for this user — this run samples 5 representative routes inline instead of dispatching isolated A/B sub-agents per page)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Loading spinners, toasts, "time to refresh" status all present; the one gap is the unexplained novel→dashboard bounce (see Priority Issues) giving zero feedback about why it happened |
| 2 | Match System / Real World | 3 | Mostly plain language, but internal scraper IDs leak into user-facing URLs (`novel/novelbin%3Amy-medical-skills...`) and the novel detail page shows "by My Medical Skills Give Me Experience Points" — author field is the title |
| 3 | User Control and Freedom | 2 | No visible "clear all filters" on My List's 10 simultaneous filter toggles; no bulk actions to back out of a mass status change |
| 4 | Consistency and Standards | 2 | Explorer and My List show the *same* 148 novels with completely different information (status/progress exist only in My List); Stats uses teal for hour/weekday bars but crimson for genre bars with no semantic reason for either choice |
| 5 | Error Prevention | 3 | "Refresh All Novels" is a low-risk bulk action with no confirm needed; ErrorBoundary exists as a safety net app-wide |
| 6 | Recognition Rather Than Recall | 3 | Nav is icon+label, command palette exists; "Rate" is a bare text link giving no hint that a star widget is behind it |
| 7 | Flexibility and Efficiency | 3 | Command palette (Cmd/Ctrl-K style) is a genuine power-user accelerator; but no bulk row actions and no jump-to-chapter input on a 1500+ chapter grid |
| 8 | Aesthetic and Minimalist Design | 2 | The one-accent design system is spent on every row of My List and every bar of the genre chart, which cancels out the "crimson = the one thing to do" rule the project's own DESIGN.md documents |
| 9 | Error Recovery | 3 | ErrorBoundary with a reload action exists; not stress-tested against real API failures this pass |
| 10 | Help and Documentation | 1 | No help affordance, tooltip, or onboarding hint found anywhere across 5 screens |
| **Total** | | **25/40** | **Acceptable — functional and genuinely useful, but consistency and hierarchy need real work before it reads as considered rather than assembled** |

## Design Specificity Verdict

**LLM assessment**: The visual language (abyssal black, crimson/teal/gold, Newsreader+IBM Plex Sans) is genuinely specific and well-documented in DESIGN.md — this is not a template. But the shipped screens don't consistently honor the system's own stated rules: DESIGN.md is explicit that crimson "does almost all the work" as the single action-accent and that teal is reserved for secondary/success — yet My List paints every one of 148 rows' primary button in crimson, and Stats paints a purely descriptive genre-frequency chart in the same crimson while an equally descriptive hour/weekday chart gets teal for no evident semantic reason. The result: the accent stops meaning "the one thing to do here" and becomes generic chart/button fill, which is exactly the outcome the system's own Named Rules were written to prevent. The Dashboard and Stats screens also front-load anxiety-coded numbers (145 novels behind, 182,407 new chapters, 1% completion rate) in the same large bold type used for the app's positive metrics, which fights the "private study, unhurried" north star the design system claims.

**Deterministic scan**: `detect.mjs` found 1 issue in `frontend/src`: a `layout-transition` warning in `components/ProgressBar.tsx:36` (`transition: width`) — animating `width` causes layout thrash; every progress bar on My List and Novel detail pages inherits this. No false positives to report; this is the only automated finding, everything else below came from direct source/browser review.

## Overall Impression

This is a real, working, richly-featured personal reading tracker with a distinctive dark editorial identity and a genuinely good power-user feature (the command palette) — it does not look like a template. The gap is discipline: the same accent color is reused for wildly different jobs across screens (state, chart fill, every button in a list), the same data (148 tracked novels) is presented two incompatible ways depending on which nav item you click, and the two most prominent numbers on the app's two main screens are both discouraging by construction. The single biggest opportunity is enforcing the design system's own rules against the shipped code — this is a system that already knows what it wants to be and isn't consistently doing it.

## What's Working

- **Command palette** (`CommandPalette.tsx`) — a real power-user accelerator that most personal tools this size skip entirely; jumps straight to a novel by name or a page by command.
- **Explorer grid** — clean, image-forward, no accent-color noise; the best-looking screen in the app precisely because it doesn't over-apply the accent.
- **Reading Timeline / By Genre / heatmap concept** — the underlying data visualizations (chapters-over-time sparkline, genre breakdown, activity heatmap) are the right instinct for a reading tracker and clearly reflect real usage data, not filler.

## Priority Issues

**[P1] The one-accent rule is violated by the app's own busiest screens**
- **Why it matters**: DESIGN.md documents crimson as the single accent that should carry "almost every action" and reads as "the thing to do here." My List paints all 148 "Continue Reading" buttons crimson and the Stats genre chart fills every bar crimson too — so on the two data-densest screens, the accent no longer signals anything special. A design system that can't hold its own primary rule under real data isn't finished.
- **Fix**: Reserve filled crimson for one action per view (e.g., the single most-recent/most-relevant row), demote repeated list-row actions to the existing `.btn-ghost` style, and pick one neutral/desaturated fill for purely descriptive bar charts (genre, hour, weekday) — save crimson and teal for when a bar or state actually needs to stand out.
- **Suggested command**: `/impeccable quieter`

**[P1] The two most prominent numbers on the app are both bad news**
- **Why it matters**: Dashboard's second-most-visible element (after the calm "Continue Reading" hero) is "182,407" new chapters and "145" novels behind, both in large bold crimson. Stats opens with "Completion Rate: 1%." For a personal habit tool whose stated identity is a quiet, unhurried "private study," leading with guilt-scale numbers in the same visual weight as positive metrics (streak, hours read) actively works against that identity.
- **Fix**: Reframe or visually demote the catch-up-debt metrics (smaller type, muted/neutral color, or contextualized language like "some catching up to do" instead of a raw six-digit count), and let the streak/hours/completed metrics lead the hierarchy instead.
- **Suggested command**: `/impeccable clarify`

**[P2] Explorer and My List disagree about what "your library" looks like**
- **Why it matters**: Both screens list the same 148 novels. My List shows status (Reading/On-hold/Plan-to-read), progress fraction, last-read time, and a continue action per row. Explorer — the browsing/discovery view — shows none of that: no status badge, no progress indicator, just chapter counts. A user scanning Explorer can't tell what they've already started.
- **Fix**: Surface at minimum a status badge and a thin progress sliver on tracked novels' Explorer cards, reusing the same status vocabulary My List already has.
- **Suggested command**: `/impeccable layout`

**[P2] The reading-activity heatmap is a wall of 365 unlabeled cells to anything but a mouse**
- **Why it matters**: Each of the year's 365 day-cells exposes only a raw `description` string ("2026-01-20: 174 chapters") with no grouping, heading structure, or summary region — a keyboard or screen-reader user must step through all 365 to get anything from this component, with nothing but "Less/More" as a legend.
- **Fix**: Wrap the grid as one labelled region with an `aria-label`/live summary ("5,876 chapters across the year, 30-day streak"), mark individual day-cells as presentational, and group by month for anyone tabbing through.
- **Suggested command**: `/impeccable audit`

**[P3] "Rate" gives no hint that a star widget exists**
- **Why it matters**: DESIGN.md calls out the hand-tuned gold rating stars as a signature, deliberately-not-generic component — but on the novel detail page, rating is a plain underlined text link with no stars visible until clicked. First-time raters have no visual cue this is anything but a text link to another page.
- **Fix**: Show the (empty/outlined) star row by default so the signature component is visible, not hidden behind a text label.
- **Suggested command**: `/impeccable delight`

## Persona Red Flags

**Alex (Power User)**: The command palette is a genuine win, but there's no visible entry point or shortcut hint anywhere in the UI (no `⌘K` badge in the header search or nav) — Alex has to already know it exists. My List has zero bulk actions: changing status on 10 novels at once means 10 separate dropdown interactions. The 1500+ chapter grid on Novel detail has no jump-to-chapter input, only manual pagination through fixed 300-chapter windows.

**Jordan (First-Timer)**: "Sync Conflicts," "Novels Behind," and URLs containing raw scraper IDs (`novelbin%3A...`) assume the user already understands the app's internal model. The activity heatmap has no explanation of what a cell represents beyond "Less/More." The plain-text "Rate" link (see P3) reads as a dead link, not an invitation to rate.

**Sam (Accessibility-Dependent)**: The heatmap's 365-cell flood (P2) is the sharpest problem. The chapter-grid legend (Read/Current/Unread) appears to rely on three similarly-shaped colored squares — worth verifying the three states are distinguishable by shape or pattern, not hue alone, for a color-vision-deficient user.

## Minor Observations

- `ProgressBar.tsx:36` animates `width` directly (flagged by the detector) — switch to `transform: scaleX()` to avoid layout thrash on every progress update.
- Novel detail's "by My Medical Skills Give Me Experience Points" shows the novel's own title in the author field — a data/scraping issue, not a layout one, but it undermines trust in the surrounding metadata at a glance.
- During this session, a direct browser navigation to a novel detail URL rendered correctly once, then the tab's URL and content silently reverted to `/dashboard` a short time later with no visible error or toast. A follow-up timed test over 10 seconds did not reproduce it. Flagging as "worth a manual double-check" rather than a confirmed defect — if real, it would break bookmarks, refresh, and shared links to a specific novel.
- My List surfaces 10 simultaneous filter controls (6 status tabs + 4 "smart" filters) above the table before any interaction — right at the edge of the ≤4-per-decision-point guidance; consider collapsing the smart filters behind a secondary disclosure.

## Questions to Consider

- If crimson can't stay special when applied to 148 rows at once, does "one accent does all the work" need a second, quieter accent for "the thing that's just true," distinct from "the thing to click"?
- What would the Dashboard look like if it led with the reader's best number instead of their backlog?
- Should Explorer and My List actually be two views of one component, so they can never drift out of sync again?
