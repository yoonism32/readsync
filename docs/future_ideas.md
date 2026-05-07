# ReadSync - Future Ideas & Development Notes

> Consolidated document combining implemented features, future ideas, and development experiments.

---

## Table of Contents

1. [Implemented Features](#implemented-features)
2. [Tailwind CSS Migration (Feb 2026 - Incomplete)](#tailwind-css-migration-feb-2026---incomplete)
3. [Future Ideas (Jan 2026)](#future-ideas-jan-2026)
4. [Productivity & Power User (Feb 2026)](#5-productivity--power-user-feb-2026)
5. [Resources & References](#resources--references)
6. [New Features](#new-features)

---

## Implemented Features

## Features 1-8, 10 (Complete)

### 1. Novel Notes System

**What:** Add freeform text notes to any novel
**API Endpoints:**

- `GET /api/v1/novels/:novelId/notes` - Get all notes for a novel
- `POST /api/v1/novels/:novelId/notes` - Create a new note
- `PUT /api/v1/notes/:noteId` - Update a note
- `DELETE /api/v1/notes/:noteId` - Delete a note

**Usage:**

- Attach notes to specific chapters or the entire novel
- Useful for tracking character names, plot points, or reasons for dropping
- Example: "MC's wife is Xia Tian, not Xia Ling"

### 2. Last Refresh Persistence

**What:** Your refresh timer now persists across browser sessions
**Database:** New `user_settings` table stores last refresh timestamp
**Endpoints:**

- `GET /api/v1/settings/last-refresh` - Get last refresh time
- `POST /api/v1/settings/last-refresh` - Update last refresh time

### 3. Quick Filters on MyList

**What:** Filter novels by status directly on MyList
**Implementation:** Frontend-only filtering (no new endpoints needed)
**Status options:** All Novels, Reading, Completed, On Hold, Dropped, Removed

### 4. Bulk Status Change

**What:** Change status for multiple novels at once
**API Endpoint:**

- `POST /api/v1/novels/bulk-status`
- Body: `{ "novel_ids": ["id1", "id2"], "status": "completed" }`

### 5. Export/Import Backup

**What:** Full data portability and backup
**API Endpoints:**

- `GET /api/v1/export` - Export all your data as JSON
- `POST /api/v1/import` - Restore from backup

**Exports:** All novels with metadata, complete progress history, bookmarks, notes, categories/tags
**Access:** Visit `/settings` page

### 6. Custom Sort Persistence

**What:** Your preferred sort order saves automatically
**Implementation:** localStorage (no backend needed)

### 7. Novel Categories/Tags System

**What:** Organize novels with custom tags
**API Endpoints:**

- `GET /api/v1/categories` - Get all your categories
- `GET /api/v1/novels/:novelId/categories` - Get categories for a novel
- `POST /api/v1/novels/:novelId/categories` - Add category to novel
- `DELETE /api/v1/novels/:novelId/categories/:category` - Remove category

### 8. Unread Chapter Counter + Smart Color Dots

**What:** Visual indicators for novel status on MyList

**Unread Badge:** Green `+X` badge shows new chapters since last read

**Smart Color Dots:**

- 🟢 **Green (Glowing)** - New chapters (1-10 unread)
- 🔵 **Blue** - Caught up! (0 unread)
- 🟠 **Orange** - Behind (11-50 unread)
- 🔴 **Red** - Way behind (50+ unread)

---

## Tailwind CSS Migration (Feb 2026 - Incomplete)

## Overview

Attempted to migrate from inline CSS (700+ lines per HTML file) to Tailwind CSS for:

- Consistent design system
- Easier maintenance
- Smaller file sizes
- Modern tooling

## What Was Done

### 1. Tailwind Setup (Working)

```bash
npm install -D tailwindcss
```

**tailwind.config.js** - Custom color palette from mylist.html:

```javascript
module.exports = {
  content: ["./public/**/*.html", "./public/**/*.js"],
  theme: {
    extend: {
      colors: {
        primary: { DEFAULT: '#6366f1', soft: 'rgba(99, 102, 241, 0.14)', strong: 'rgba(99, 102, 241, 0.4)' },
        accent: '#a855f7',
        bg: { DEFAULT: '#020617', card: '#0f172a', hover: '#1e293b', row: '#0c1322' },
        border: { subtle: '#1e293b', strong: '#334155' },
        txt: { primary: '#e5e7eb', secondary: '#9ca3af', muted: '#6b7280' },
        danger: '#ef4444', success: '#22c55e', warning: '#f59e0b',
        teal: '#3cb2ad',
        'dot-green': '#22c55e', 'dot-blue': '#3b82f6', 'dot-orange': '#f59e0b', 'dot-red': '#ef4444',
        // ... more colors
      },
      boxShadow: { 'card': '0 18px 55px rgba(0, 0, 0, 0.65)', 'glow-green': '0 0 8px rgba(34, 197, 94, 0.6)' },
      backgroundImage: {
        'gradient-header': 'linear-gradient(135deg, #6366f1, #a855f7)',
        'gradient-body': 'radial-gradient(circle at top, #1f2933 0, #020617 55%)'
      },
    },
  },
}
```

**package.json** - Build script:

```json
"scripts": {
  "build:css": "npx tailwindcss -i ./src/input.css -o ./public/css/styles.css --minify"
}
```

**Render deployment:** Build Command: `npm install && npm run build:css`

### 2. src/input.css Structure (1200+ lines)

Created comprehensive component library using `@apply`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  body { @apply font-sans bg-gradient-body text-txt-primary min-h-screen; }
}

@layer components {
  /* Layout */
  .container { @apply max-w-[1200px] mx-auto px-5 py-5; }

  /* Cards */
  .card { @apply bg-bg-card border border-border-subtle rounded-xl p-6 transition-all duration-200; }
  .stat-card { @apply bg-bg-card border border-border-subtle p-6 rounded-xl text-center; }
  .novel-card { @apply bg-bg-card border border-border-subtle rounded-2xl p-6 transition-all duration-200; }

  /* Buttons */
  .btn { @apply inline-flex items-center justify-center px-4 py-2 rounded-lg font-medium transition-all duration-200 cursor-pointer border; }
  .btn-primary { @apply bg-primary text-white border-primary; }
  .btn-secondary { @apply bg-bg-card text-primary border-border-subtle; }

  /* Status Pills */
  .status-pill { @apply inline-flex items-center justify-center py-0.5 px-2 rounded-full text-[0.7rem] uppercase tracking-wide; }
  .status-pill.reading { @apply border-blue-500/70 bg-blue-600/20 text-blue-200; }
  .status-pill.completed { @apply border-green-600/70 bg-green-600/15 text-green-200; }

  /* ... 1000+ more lines for all page-specific styles */
}
```

### 3. What Went Wrong

**Problem:** Removed inline `<style>` blocks from all 10 HTML files, but the Tailwind component classes didn't match all the class names used in the HTML.

**Root Cause:**

- mylist.html worked (classes matched)
- Other pages used different class names (`.login-container`, `.global-progress`, `.device-card`, etc.)
- These weren't initially defined in input.css
- Added them, but CSS build had syntax errors from mismatched `@layer components` blocks

**Files Modified (need reverting):**

- `src/input.css` (new)
- `tailwind.config.js` (new)
- `package.json` (modified)
- All 10 HTML files in `/public/` (inline styles removed)

### 4. To Complete This Later

#### Option A: Fix current approach

1. Ensure ALL class names from HTML files are defined in input.css
2. Test each page individually
3. Classes needed per page:
   - login.html: `.login-container`, `.login-card`, `.logo`, `.form-group`, `.btn-login`, `.error-message`, `.shooting-star`, `.footer`
   - dashboard.html: `.novel-card`, `.novel-header`, `.global-progress`, `.devices-section`, `.device-card`, `.leader-badge`, `.actions`
   - admin.html: `.panel`, `.nav`, `.auth-section`, `.status-grid`, `.status-card`, `.toast`, `.badge`
   - novel.html: `.back-link`, `.novel-detail-header`, `.novel-cover`, `.section-title`, `.history-item`
   - settings.html: `.settings-section`, `.setting-row`, `.api-key-display`
   - manage.html: `.manage-actions`, `.novel-list-item`, `.novel-list-cover`
   - explorer.html: `.explorer-tabs`, `.endpoint-card`, `.endpoint-method`, `.response-area`

#### Option B: Gradual migration

1. Keep inline styles
2. Add Tailwind utilities alongside existing CSS
3. Migrate one page at a time
4. Remove inline styles only after verified

#### Option C: Use Tailwind differently

1. Don't use `@apply` components
2. Replace class names in HTML with Tailwind utilities directly
3. More verbose but simpler

### 5. Commits Made (to be reverted)

- `6f6c141` - Implement Tailwind CSS configuration and input styles for ReadSync Design System
- `7ce230b` - Fix Tailwind CSS build by wrapping page-specific styles in @layer components

---

## Future Ideas (Jan 2026)

> After 5 months of development (Aug 2025 - Jan 2026), ReadSync is stable and functional.

## Proposed Changes

### Login Return URL Feature

**Problem:** When logged out on a specific page, login always redirects to `/` instead of returning you to where you were.

**Solution:** Pass `returnUrl` query param when redirecting to login.

```javascript
// server.js - requireAuth middleware
res.redirect('/login?returnUrl=' + encodeURIComponent(req.originalUrl));

// server.js - redirectIfAuthenticated middleware
const returnUrl = req.query.returnUrl || '/';
return res.redirect(returnUrl);

// login.html - Login success redirect
const params = new URLSearchParams(window.location.search);
const returnUrl = params.get('returnUrl') || '/';
window.location.href = returnUrl;
```

---

## 1. Visual Polish

### Micro-Interactions

- Button hover animations (200-500ms, subtle bounces)
- Scroll-triggered fade-ins for content blocks
- Tactile toggle switches with elastic effects
- Loading states with skeleton screens

### Modern Aesthetics

- **Glassmorphism** - frosted glass blur effect on cards/modals
- **Depth & Layering** - z-axis parallax for premium feel
- **Smooth page transitions** - instead of hard navigations
- **Kinetic typography** - animated text in hero sections

### Tools

- Framer Motion (React), GSAP (vanilla JS), Pure CSS, Rive

---

## 2. Technical Impressiveness

### Already Impressive

- Real-time WebSocket sync across devices
- Puppeteer-based automated chapter scraper
- Multi-device conflict resolution
- 60+ API endpoints with proper validation
- PostgreSQL with optimized indexing

### Level-Up Ideas

#### CRDTs for Conflict Resolution

- Replace "latest wins" with conflict-free replicated data types
- Libraries: Yjs, Automerge

#### Chrome Extension

- Upgrade from Tampermonkey userscript
- Manifest V3 compliant
- Proper extension popup with quick stats

#### CLI Tool

```bash
readsync status              # Show sync status
readsync list --reading      # List currently reading
readsync progress "Novel X"  # Show progress
readsync sync                # Force sync
```

#### GraphQL API

- Add alongside existing REST API
- Subscriptions for real-time updates

---

## 3. Signature Features

### Reading Time Machine

- Animated visualization of reading journey over time
- Scrub through timeline, see progress across all novels
- D3.js or Chart.js with animations

### Ghost Position

- Show faint markers where OTHER devices left off
- "Your phone is at chapter 45, your tablet at chapter 42"

### Reading Heatmap

- GitHub-style contribution graph for reading activity
- Shows reading patterns over weeks/months

### Chapter Diff

- When bot detects novel updates, show what changed
- "3 new chapters since your last visit"

### Reading Wrapped (Annual)

- Spotify Wrapped style yearly summary
- Total chapters read, most binged novel, reading streaks
- Genre distribution, peak reading hours
- Shareable card format

---

## 4. Scope Expansion

### Multi-Source Support

- Not just NovelBin - add support for other novel sites
- Unified library across sources

### Public API

- Document API for potential third-party use
- Rate limiting, API key management

### Mobile PWA Enhancement

- Full offline support with service workers
- Background sync, install prompt, push notifications

---

---

## 5. Productivity & Power User (Feb 2026)

### 9. Command Palette (Ctrl+K)

**What:** VS Code / Spotlight-style quick launcher overlay
**Builds on:** 10 pages, 60+ endpoints, lots of navigation already

**Actions:**

- Jump to any novel by typing its name (fuzzy match)
- Quick-change novel status without opening the page
- Navigate to any page: `/mylist`, `/admin`, `/settings`
- Trigger actions: "refresh novels", "export backup", "run bot"
- Search notes & bookmarks inline

**Implementation:**

```javascript
// Keyboard listener
document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
    e.preventDefault();
    openCommandPalette();
  }
});

// Fuzzy search against a unified action registry
const actions = [
  { type: 'novel', label: novel.title, action: () => navigate(`/novel/${id}`) },
  { type: 'page', label: 'My List', action: () => navigate('/mylist') },
  { type: 'command', label: 'Export Backup', action: () => exportData() },
  // ...
];
```

**UI:** Dark modal with input field, results list, keyboard navigation (arrow keys + Enter)
**New endpoints:** None — fully frontend, pulls from existing `/api/v1/novels` + static action list

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
**Builds on:** `user_settings` table already has a `theme VARCHAR(50)` column (unused), `practice.html` has a full component library

**Themes:**

- **Midnight** (current default) — deep navy/slate
- **AMOLED** — true black backgrounds for OLED screens
- **Solarized Dark** — warm dark with amber accents
- **Light** — clean white/gray for daytime reading

**Custom accent color picker:** Replace the hardcoded `#6366f1` primary with any user-chosen color
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

**Frontend:** New section in `/settings` page with live preview swatches

---

### 13. Batch Import from URLs

**What:** Paste multiple NovelBin URLs at once to bulk-add novels
**Builds on:** Single novel auto-detection via userscript, bot scraper can already extract metadata from any novel page

**Flow:**

1. User pastes 1-20 NovelBin URLs (textarea, one per line)
2. Backend queues them for metadata scraping
3. Progress bar shows: "Importing 3/10..."
4. Each novel gets title, author, cover, chapter count auto-populated
5. User confirms which to actually add to their library

**API Endpoints:**

- `POST /api/v1/novels/batch-import` — Accept array of URLs, return job ID
- `GET /api/v1/novels/batch-import/:jobId` — Poll import progress

**Implementation:** Reuse existing Puppeteer scraper logic from `chapter-update-bot-enhanced.js`:

```javascript
// Extract from bot's existing scrape logic
async function scrapeNovelMetadata(url) {
  // Same Puppeteer + stealth setup as bot
  // Extract: title, author, genre, cover, latest chapter
  // Respect existing throttle: 10s gap between requests
}
```

**UI:** New button on `/manage` page: "Import Novels" → modal with URL textarea + progress

---

### 14. Chapter Highlights & Annotations (Userscript)

**What:** Highlight text passages while reading and sync them to the server
**Builds on:** Notes system exists (novel_notes table), userscript already modifies page DOM heavily

**Flow:**

1. Select text on NovelBin chapter page
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

### 15. Offline Mode with Service Worker

**What:** Read cached chapters and queue progress updates when offline
**Builds on:** Userscript already caches some data in localStorage, progress sync infrastructure exists

**Capabilities:**

- Cache the last 5 read chapters per novel (HTML content)
- Queue progress saves locally when offline
- Auto-sync queued updates when connection restores
- Show "Offline" banner with cached content indicator

**Implementation:**

```javascript
// service-worker.js
self.addEventListener('fetch', (event) => {
  if (event.request.url.includes('/api/v1/progress')) {
    event.respondWith(
      fetch(event.request).catch(() => {
        // Queue in IndexedDB for later sync
        return queueForSync(event.request);
      })
    );
  }
});

// Background sync
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-progress') {
    event.waitUntil(flushProgressQueue());
  }
});
```

**New files:** `public/service-worker.js`, registration in `shared.js`
**Storage:** IndexedDB for chapter cache + pending progress queue

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

**UI:** New section on `/settings` page: "Maintenance" with scan results + checkboxes + "Fix Selected" button

---

### 17. Userscript Reading Modes

**What:** Customizable reading experience injected into NovelBin pages
**Builds on:** Userscript already injects UI overlays, keyboard shortcuts, progress bars, and modifies the DOM

**Modes:**

- **Night Mode** — True dark background with warm text (#faf3e0 on #1a1a1a)
- **Sepia Mode** — Paper-like warm tones (#f4ecd8 background)
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

---

## Priority Matrix

| Feature                 | Effort | Impact | Portfolio Value |
|-------------------------|:------:|:------:|:----------------|
| Micro-interactions      | Low    | High   | Medium          |
| Reading Heatmap         | Medium | High   | Medium          |
| Chrome Extension        | Medium | Medium | High            |
| CLI Tool                | Medium | Low    | High            |
| CRDTs                   | High   | Low    | Very High       |
| Time Machine            | High   | High   | High            |
| GraphQL                 | Medium | Low    | High            |
| Tailwind Migration      | Medium | Medium | Low             |
| Command Palette         | Low    | High   | Medium          |
| Dead Novel Detection    | Low    | High   | Low             |
| Unified Search          | Medium | High   | Medium          |
| Theme Engine            | Medium | Medium | Low             |
| Batch Import            | Medium | Medium | Medium          |
| Chapter Highlights      | High   | Medium | High            |
| Offline Mode            | High   | Medium | Very High       |
| Auto-Cleanup            | Low    | Medium | Low             |
| Reading Modes           | Low    | High   | Low             |

---

## Resources & References

## Design Inspiration

- [Developer Portfolios](https://github.com/emmabostian/developer-portfolios)
- [Bestfolios](https://www.adhamdannaway.com/blog/web-design/design-portfolio-inspiration)

## UI/UX Trends 2026

- [Micro-Interactions & Motion](https://primotech.com/ui-ux-evolution-2026-why-micro-interactions-and-motion-matter-more-than-ever/)
- [Motion UI Trends](https://www.betasofttechnology.com/motion-ui-trends-and-micro-interactions/)
- [Web Design Trends 2026](https://muz.li/blog/web-design-trends-2026/)

## Technical References

- [Full-Stack Project Ideas](https://www.frontendmentor.io/articles/full-stack-project-ideas)
- [Tailwind CSS Docs](https://tailwindcss.com/docs)

---

## Database Tables (Reference)

```sql
-- Novel notes
CREATE TABLE novel_notes (
    id BIGSERIAL PRIMARY KEY,
    user_id TEXT NOT NULL,
    novel_id TEXT NOT NULL,
    note_text TEXT NOT NULL,
    chapter_num INTEGER,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- User settings
CREATE TABLE user_settings (
    user_id TEXT PRIMARY KEY,
    last_refresh_timestamp BIGINT,
    sort_preference JSONB,
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Novel categories/tags
CREATE TABLE novel_categories (
    user_id TEXT NOT NULL,
    novel_id TEXT NOT NULL,
    category TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (user_id, novel_id, category)
);
```

---

## New Features

google - <https://claude.ai/chat/057359ef-5bab-42aa-b04a-46a30f63de5f>

00:50
You want Google OAuth as a login method — so instead of (or alongside) your current admin password login, you can click "Login with Google", go through Google's consent screen, come back authenticated, and your session is set.

The reason it's useful for you specifically is settings sync — once you're logged in via Google, your preferences (theme, UI, reading defaults) are tied to your Google account and stored in postgres. So if you open ReadSync on a different device or browser, you login with Google and your settings load automatically.

That's it. Two things:

Google as the login button — replaces typing a password, just click and authenticate with Google
Settings persist per Google account — stored in your users table, loaded on every login
Since it's just you, there's no signup flow, no user creation — Google login just links to your existing demo-user row and stamps it with your Google profile info (email, avatar) so the app knows it's you.

## Last updated: April 1, 2026
