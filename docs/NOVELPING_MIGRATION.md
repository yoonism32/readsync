# NovelPing support — additive migration plan

Status: in progress (started 2026-10-02). Strategy: **append NovelPing alongside NovelArrow**, never
replace in one step; retire NovelArrow only after an observation period.

## Why now

`novelarrow.com` already 302-redirects every URL to `novelping.com` (`/novel/<slug>` →
`/novel/<slug>`, `/chapter/<slug>/chapter-N-title` → `/novel/<slug>/chapter-N`); `images.novelarrow.com`
still serves 200. Stored `primary_url`s therefore land on a host the userscript does not match.

## Evidence (audit of all 149 library novels vs live novelping.com, 2026-10-02)

- 149/149 slugs resolve; identity stays `novelbin:<slug>` (no history split).
- NovelPing serves **both** `/novel/<slug>[/chapter-N…]` and `/book/<slug>[/chapter-…]`;
  `/chapter/<slug>/…` is 404; `www.` 301s to the bare root.
- Chapter number: stored values follow the **URL index**, not the title number (URL `chapter-1000`
  can carry title "Chapter 991"). Parse the URL first on NovelPing.
- Numeric-only `/…/chapter-N` redirects to the novel page when the canonical URL has a title slug →
  never build chapter URLs by hand on NovelPing; follow real links (`a.js-chapter-nav`).
- Hidden `button.listen-btn` (aria-label "Next/Previous chapter", 0×0) shadows `main.ts` navigate Stage 2.
- Latest-chapter meta is misspelled `og:novel:lastest_chapter_name` (+ `…_url`); `.l-chapter` agrees.
- Synopsis lives in `#novel-description-content`. Cover is `images.novelping.com` (`?v=` suffix).
- `og:novel:update_time` is ISO, a JS `Date.toString()` string (parses fine in Node), or the
  placeholder `2026-03-01`.
- Named final chapters (`/epilogue`) have no number in the URL.
- Data: 139k `progress_snapshots` (76,875 novelarrow, 62,192 dead novelbin.com URLs); 148/149 covers
  already mirrored in Supabase Storage.

## Phases

### Phase 0 — prep
- Branch `feat/novelping-support`; baseline `npm test` + typecheck green.
- Fresh `~/readsync-backups/backup.sh` dump immediately before Phase 5.

### Phase 1 — server accepts NovelPing (additive, backward compatible)
Tests first (`__tests__/regression/`), then:
- `src/services/ReaderUrl.ts`: add `novelping.com` to `READER_HOSTS` (also feeds REST CORS and
  `isReaderCoverUrl` → `images.novelping.com`); `isReaderChapterUrl` accepts
  `/(novel|book)/<slug>/chapter-<N>[-title]` for novelping.
- `src/services/NovelService.ts`: `NOVEL_SLUG_PATTERN` gains `book`; `deriveNovelMainUrl` /
  `parseChapterFromUrl` verified for both grammars. `healDeadSiteUrl` target unchanged until Phase 5.
- NovelArrow/NovelBin behaviour must be byte-for-byte unchanged (existing tests stay green).

### Phase 2 — dual-site userscript (version bump)
Tests first (`__tests__/regression/`), then:
- `vite.config.ts`: `@match` for `novelping.com/novel/*` and `/book/*`; `@connect images.novelping.com`.
- `ChapterDetector.ts`: `normalizeNovelId` + latest-chapter slug lookup + same-novel link selectors
  include `book` (and `/novel/<slug>/`); URL-first `parseChapterEnhanced` for
  `/(novel|book)/<slug>/chapter-N`; `lastest_chapter_name` typo fallback.
- `PageMetadata.ts`: synopsis from `#novel-description-content` before the legacy fallbacks.
- `main.ts`: navigate skips hidden/zero-size aria buttons and prefers `a.js-chapter-nav`; Stage 6
  numeric fallback must not reload the same URL on NovelPing paths.

### Phase 3 — diagnostic parity
Update `scripts/site-health-diagnostic.console.js` (hosts, `/book/`+`/novel/`, URL-number-vs-title
check, href-based agreement). Careful: that path has a pre-existing staged deletion — do not commit it.

### Phase 4 — deploy + verify (keep NovelArrow live)
Deploy server, install userscript, then on 2 novels in a real browser: chapter read → progress
snapshot saved, novel page → auto-update, Refresh All, A/D navigation, cover/synopsis import.

### Phase 5 — data + UI cutover (reversible)
- Fresh dump; rehearse on local `rs-local` first.
- Migration: `novels.primary_url` arrow → `https://novelping.com/novel/<slug>`.
- `healDeadSiteUrl` targets NovelPing for novelbin AND novelarrow snapshot URLs (heal at read time;
  do not rewrite 139k rows). `covers.ts` source origin/referer → novelping.
- UI strings "NovelArrow" → "NovelPing" (`Novel.tsx` 202/209/226, `MyList.tsx` 255); rebuild `public/app`.
- Verify Refresh All after the switch (no cross-site redirect → opener/name survive).

### Phase 6 — data hygiene (decide separately)
- `awakening-the-daily-intelligence-system`: stored latest 3029 vs site 882 — heal via confirm-twice
  Refresh All or a one-off fix. Backfill the 68 empty synopses via the import flow.
- Named-final-chapter URLs (`/epilogue`): decide whether to support (position-based number).

### Phase 7 — phase out NovelArrow
Only after ≥30 days with: zero new snapshots on novelarrow hosts, redirect still in place or gone,
no Refresh All failures. Then remove NovelArrow @match/READER_HOSTS entries and legacy tests.

## Known unknowns
- Redirect permanence (302). Re-check periodically.
- Tampermonkey cross-origin prompt for `images.novelping.com` (mitigated by `@connect`).
- Refresh All opener/name survival across the cross-site redirect (moot after Phase 5).
- Socket.IO CORS uses `ALLOWED_ORIGINS` only (userscript believed not to use sockets).
