# Future feature specs — power-user tier

Referenced from [ROADMAP.md](../ROADMAP.md)'s Tier 4. Full specs for the
still-open power-user ideas from the original `future_ideas.md` brainstorm
(numbered #10–#17 in the source; #9 and #15 are intentionally excluded —
see note below). Full original document, including the abandoned Tailwind
migration and other historical notes:
[`docs/changelog/2026-08-level-up.md`](../changelog/2026-08-level-up.md)
references it; the source file itself predates this reorganization and its
content is preserved here for the specs that are still live.

> **Excluded from this list:** #9 (Command Palette) shipped — it's live in
> `frontend/src/components/CommandPalette.tsx`. #15 (Offline Mode with
> Service Worker) is superseded by the broader "Offline-first PWA" item
> already tracked in [ROADMAP.md](../ROADMAP.md)'s Tier 2.

---

### 10. Dead Novel Detection & Auto-Triage

**What:** Automatically flag novels that stopped updating and suggest cleanup actions
**Builds on:** Bot already tracks `chapters_updated_at`, `/api/v1/admin/novels/stale` exists

**Rules:**

- **Likely abandoned:** No update in 90+ days → suggest moving to on-hold
- **Confirmed dead:** No update in 180+ days → suggest dropping
- **Source broken:** Bot gets repeated 404s → flag URL as dead
- **Completed by author:** Detect "completed" / "end" in latest chapter title

**API Endpoints:**

- `GET /api/v1/novels/health` — Returns novels grouped by health status
- `POST /api/v1/novels/triage` — Bulk apply suggested status changes

**UI:** Banner on MyList: "3 novels may be abandoned — Review" → opens triage modal with one-click accept/dismiss per novel

**Database:** Add column to `novels`:

```sql
ALTER TABLE novels ADD COLUMN health_status TEXT DEFAULT 'active';
-- Values: active, stale, abandoned, source_dead
ALTER TABLE novels ADD COLUMN consecutive_scrape_failures INTEGER DEFAULT 0;
```

---

### 11. Unified Search (Notes, Bookmarks, Novels, Tags)

**What:** One search bar that queries everything at once
**Builds on:** Novels, notes, bookmarks, categories exist as separate entities with no cross-search

**Search targets:**

- Novel titles and authors
- Note text (e.g. "find that note about the cultivation technique")
- Bookmark notes
- Category/tag names

**API Endpoint:**

- `GET /api/v1/search?q=dragon&types=novels,notes,bookmarks`

**Response:**

```json
{
  "results": [
    { "type": "novel", "id": "novelbin:dragon-emperor", "title": "Dragon Emperor", "match": "title" },
    { "type": "note", "novel_id": "novelbin:xyz", "snippet": "...MC gains dragon bloodline in ch 45...", "match": "note_text" },
    { "type": "bookmark", "novel_id": "novelbin:abc", "note": "dragon fight scene", "match": "note" }
  ]
}
```

**Backend:** Single SQL query with `UNION ALL` across tables, `ILIKE '%query%'` with `ts_rank` for relevance
**Frontend:** Search icon in header → dropdown results grouped by type

---

### 12. Theme Engine & Custom Accent Colors

**What:** Full dark/light/custom theme system with live preview
**Builds on:** `user_settings` table already has a `theme VARCHAR(50)` column (unused)

**Themes:**

- **Midnight** (current default) — deep navy/slate
- **AMOLED** — true black backgrounds for OLED screens
- **Solarized Dark** — warm dark with amber accents
- **Light** — clean white/gray for daytime reading

**Custom accent color picker:** Replace the hardcoded primary accent with any user-chosen color
**Font size slider:** Scale base font from 14px to 20px

**Implementation:**

```javascript
// CSS custom properties driven by user_settings.theme JSONB
document.documentElement.style.setProperty('--color-primary', userTheme.accent);
document.documentElement.style.setProperty('--bg-body', userTheme.bgBody);
document.documentElement.style.setProperty('--font-size-base', userTheme.fontSize + 'px');
```

**API:** Extend existing settings endpoints:

- `PUT /api/v1/settings/theme` — Save theme preferences
- Theme stored as JSONB in `user_settings.theme`

**Frontend:** New section in `/app/settings` page with live preview swatches

---

### 13. Batch Import from URLs

**What:** Paste multiple NovelBin/NovelArrow URLs at once to bulk-add novels
**Builds on:** Single novel auto-detection via userscript; `bot/src/services/NovelScraper.ts`
can already extract metadata from any novel page (the original spec referenced
`chapter-update-bot-enhanced.js`, since deleted — this is its TypeScript successor)

**Flow:**

1. User pastes 1-20 URLs (textarea, one per line)
2. Backend queues them for metadata scraping
3. Progress bar shows: "Importing 3/10..."
4. Each novel gets title, author, cover, chapter count auto-populated
5. User confirms which to actually add to their library

**API Endpoints:**

- `POST /api/v1/novels/batch-import` — Accept array of URLs, return job ID
- `GET /api/v1/novels/batch-import/:jobId` — Poll import progress

**Implementation:** Reuse `bot/src/services/NovelScraper.ts` and
`bot/src/parseNovelInfo.ts` — same Puppeteer + stealth setup and throttling
the bot already has. **Note:** the bot is currently intentionally disabled
in production (see [ARCHITECTURE.md](../ARCHITECTURE.md)) — this feature
would need that decision revisited first, or a standalone scrape path.

**UI:** New button on `/app/manage` page: "Import Novels" → modal with URL textarea + progress

---

### 14. Chapter Highlights & Annotations (Userscript)

**What:** Highlight text passages while reading and sync them to the server
**Builds on:** Notes system exists (`novel_notes` table), userscript already modifies page DOM heavily

**Flow:**

1. Select text on a chapter page
2. Small tooltip appears: "Highlight" / "Annotate"
3. Highlight saves the text + position + optional user note
4. All highlights visible in novel detail page under a "Highlights" tab

**API Endpoints:**

- `POST /api/v1/novels/:novelId/highlights` — Save highlight
- `GET /api/v1/novels/:novelId/highlights` — Get all (filterable by chapter)
- `DELETE /api/v1/highlights/:highlightId` — Remove highlight

**Database:**

```sql
CREATE TABLE novel_highlights (
    id BIGSERIAL PRIMARY KEY,
    user_id TEXT NOT NULL,
    novel_id TEXT NOT NULL,
    chapter_num INTEGER NOT NULL,
    highlighted_text TEXT NOT NULL,
    annotation TEXT,
    text_offset INTEGER,
    created_at TIMESTAMP DEFAULT NOW()
);
```

**Userscript addition:** `Selection` API listener + tooltip popup + highlight persistence via CSS `::highlight()` or `<mark>` wrapping

---

### 16. Auto-Cleanup & Maintenance Mode

**What:** One-click codebase health scan that finds and fixes data issues
**Builds on:** Stale novels endpoint exists, export/import exists, orphaned data accumulates naturally

**Scans for:**

- **Stale novels:** No progress in 90+ days, still marked "reading"
- **Broken URLs:** Novels whose `primary_url` returns 404
- **Orphaned bookmarks:** Bookmarks for novels you've removed
- **Orphaned notes:** Notes for removed novels
- **Duplicate progress:** Multiple identical snapshots (same chapter/percent/timestamp)
- **Empty categories:** Tags with 0 novels attached

**API Endpoint:**

- `GET /api/v1/maintenance/scan` — Returns issues grouped by type with counts
- `POST /api/v1/maintenance/fix` — Apply selected fixes (body: `{ "actions": ["clean_orphaned_bookmarks", "archive_stale_novels"] }`)

**UI:** New section on `/app/settings` page: "Maintenance" with scan results + checkboxes + "Fix Selected" button

---

### 17. Userscript Reading Modes

**What:** Customizable reading experience injected into novel pages
**Builds on:** Userscript already injects UI overlays, keyboard shortcuts, progress bars, and modifies the DOM

**Modes:**

- **Night Mode** — True dark background with warm text
- **Sepia Mode** — Paper-like warm tones
- **Focus Mode** — Hide all site chrome (sidebar, ads, header, comments), just chapter text
- **Custom** — User picks background, text color, font, size, line height, max-width

**Persisted settings:** Sync via existing `/api/v1/settings` endpoint as JSONB

```javascript
// Userscript injection
function applyReadingMode(mode) {
  const chapterContent = document.querySelector('#chr-content, .chr-c');
  const styles = READING_MODES[mode];
  Object.assign(chapterContent.style, styles);
  document.body.style.backgroundColor = styles.bgColor;
}
```

**Keyboard shortcuts:** Add to existing shortcuts:

- `Shift+T` — Cycle through reading modes
- `+/-` — Increase/decrease font size
- `Shift+W` — Toggle max-width (narrow/wide)

**Settings panel:** Small gear icon in userscript's existing top bar → dropdown with sliders and color pickers
