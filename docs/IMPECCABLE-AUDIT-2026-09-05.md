# Impeccable design critique — 2026-09-05

Harsh `/impeccable critique` pass over the frontend app (Dashboard, Novel
detail, My List, Explorer, Stats). Not itemized in [ROADMAP.md](./ROADMAP.md)
— this is the detail file it points to. Full raw snapshot also lives at
`.impeccable/critique/2026-09-05T01-56-47Z__src-full-app-dashboard-novel-mylist-explorer-stats.md`.

⚠️ Run was single-context (no isolated sub-agents dispatched per page),
sampling 5 representative routes inline instead.

## Design Health Score: 25/40 (Acceptable)

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Spinners/toasts/"time to refresh" all present; the gap is an unexplained novel→dashboard bounce (see below) with zero feedback about why |
| 2 | Match System / Real World | 3 | Mostly plain language, but internal scraper IDs leak into URLs (`novel/novelbin%3A...`) and the novel page shows "by My Medical Skills Give Me Experience Points" — author field is the title |
| 3 | User Control and Freedom | 2 | No "clear all filters" on My List's 10 simultaneous filter toggles; no bulk undo for status changes |
| 4 | Consistency and Standards | 2 | Explorer and My List show the *same* 148 novels with incompatible information; Stats uses teal for hour/weekday bars but crimson for genre bars with no semantic reason for either |
| 5 | Error Prevention | 3 | Low-risk bulk actions, app-wide ErrorBoundary safety net |
| 6 | Recognition Rather Than Recall | 3 | Icon+label nav, command palette exists; "Rate" is a bare text link with no star-widget hint |
| 7 | Flexibility and Efficiency | 3 | Command palette is a real accelerator; no bulk row actions, no jump-to-chapter on a 1500+ chapter grid |
| 8 | Aesthetic and Minimalist Design | 2 | The one-accent system is spent on every My List row and every genre bar, cancelling the "crimson = the one thing to do" rule DESIGN.md itself documents |
| 9 | Error Recovery | 3 | ErrorBoundary with reload action; not stress-tested against real API failures this pass |
| 10 | Help and Documentation | 1 | No help affordance, tooltip, or onboarding anywhere across 5 screens |

## Design Specificity Verdict

**LLM assessment**: The visual language (abyssal black, crimson/teal/gold,
Newsreader+IBM Plex Sans) is genuinely specific — this isn't a template. But
the shipped screens don't consistently honor DESIGN.md's own rules: crimson
is documented as the *single* action-accent, teal reserved for
secondary/success — yet My List paints all 148 "Continue Reading" buttons
crimson, and Stats fills a purely descriptive genre chart in crimson while an
equally descriptive hour/weekday chart gets teal for no evident reason. The
accent stops meaning "the one thing to do" and becomes generic fill —
precisely what the system's own Named Rules exist to prevent. Dashboard and
Stats also front-load anxiety-coded numbers (145 novels behind, 182,407 new
chapters, 1% completion) in the same bold weight as positive metrics,
fighting the "quiet, unhurried private study" identity DESIGN.md claims.

**Deterministic scan**: `detect.mjs` found 1 issue: a `layout-transition`
warning in `frontend/src/components/ProgressBar.tsx:36` (`transition:
width`) — every progress bar on My List and Novel detail inherits this
layout-thrash risk.

## Overall Impression

A real, working, richly-featured tracker with a distinctive identity and one
genuinely good power-user feature (command palette) — not
template-interchangeable. The gap is discipline: one accent color does the
job of five different things across screens, the same 148 novels are
presented two incompatible ways depending which nav item you click, and the
two most prominent numbers on the app's two main screens are both bad news
by construction. Biggest opportunity: enforce the design system's own rules
against the shipped code.

## What's Working

- **Command palette** — a genuine power-user accelerator most tools this
  size skip entirely.
- **Explorer grid** — clean, image-forward, zero accent-color noise; the
  best-looking screen precisely because it doesn't over-apply the accent.
- **Reading Timeline / By Genre / heatmap concept** — the right instinct for
  a reading tracker, clearly built from real usage data.

## Priority Issues

**[P1] The one-accent rule is violated by the app's own busiest screens**
- **Why it matters**: My List paints all 148 row-buttons crimson; Stats
  paints every genre bar crimson too. On the two densest screens, the accent
  no longer signals anything special.
- **Fix**: Reserve filled crimson for one action per view; demote repeated
  row actions to `.btn-ghost`; give descriptive bar charts one neutral fill,
  saving crimson/teal for when something actually needs to stand out.
- **Suggested command**: `/impeccable quieter`

**[P1] The two most prominent numbers on the app are both bad news**
- **Why it matters**: "182,407 new chapters" / "145 novels behind"
  (Dashboard) and "Completion Rate: 1%" (Stats) lead the two main screens in
  the same bold weight as positive metrics — actively fighting the calm
  identity the design system claims.
- **Fix**: Reframe or visually demote catch-up-debt metrics; let
  streak/hours/completed lead the hierarchy instead.
- **Suggested command**: `/impeccable clarify`

**[P2] Explorer and My List disagree about what "your library" looks like**
- **Why it matters**: My List shows status, progress, last-read, continue
  action per row; Explorer — the browsing view of the *same* 148 novels —
  shows none of it. A user scanning Explorer can't tell what they've already
  started.
- **Fix**: Surface a status badge + progress sliver on tracked novels'
  Explorer cards.
- **Suggested command**: `/impeccable layout`

**[P2] The reading-activity heatmap is a wall of 365 unlabeled cells to
anything but a mouse**
- **Why it matters**: Each day-cell exposes only a raw description string,
  no grouping or summary region — a screen-reader/keyboard user must step
  through all 365 for nothing but "Less/More."
- **Fix**: One labelled region with an aria-summary, mark cells
  presentational, group by month.
- **Suggested command**: `/impeccable audit`

**[P3] "Rate" gives no hint a star widget exists**
- **Why it matters**: DESIGN.md calls the gold rating stars a signature
  component, but it's hidden behind a plain underlined text link until
  clicked.
- **Fix**: Show the empty/outlined star row by default.
- **Suggested command**: `/impeccable delight`

## Persona Red Flags

**Alex (Power User)**: Command palette is a win, but nothing in the UI hints
it exists (no visible shortcut badge). Zero bulk actions on My List —
changing status on 10 novels means 10 separate dropdowns. No jump-to-chapter
on a 1500+ chapter grid, only fixed 300-chapter pagination.

**Jordan (First-Timer)**: "Sync Conflicts," "Novels Behind," and raw scraper
IDs in URLs assume prior knowledge. The heatmap has no explanation beyond
"Less/More." "Rate" as bare text reads as a dead link, not an invitation.

**Sam (Accessibility-Dependent)**: The heatmap's 365-cell flood is the
sharpest problem here. The chapter-grid legend (Read/Current/Unread) looks
like three similarly-shaped colored squares — worth verifying the states are
distinguishable by more than hue.

## Minor Observations

- `ProgressBar.tsx:36` — animate `transform: scaleX()` instead of `width` to
  avoid layout thrash.
- Novel detail's "by My Medical Skills Give Me Experience Points" — author
  field holds the title (scraper data issue, not layout).
- Once during this session, a direct link to a novel detail page rendered
  correctly, then silently reverted to `/dashboard` with no error or toast;
  a follow-up 10-second timed test didn't reproduce it. Flagging as "verify
  manually," not a confirmed defect — if real, it breaks
  bookmarks/refresh/shared links.
- My List shows 10 simultaneous filter controls (6 status tabs + 4 "smart"
  filters) before any interaction — at the edge of the ≤4-per-decision-point
  guidance.

## Questions to Consider

- If crimson can't stay special across 148 rows, does the system need a
  second, quieter accent for "the thing that's just true" vs. "the thing to
  click"?
- What would Dashboard look like leading with the reader's best number
  instead of their backlog?
- Should Explorer and My List be one component with two views, so they
  can't drift out of sync again?
