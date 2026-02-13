# ReadSync - UI Overview & Design Improvement Reference

> Generated via Pencil MCP style guide analysis (Feb 2026). Use this as a reference when making UI improvements across the app.

---

## Table of Contents

1. [Project Structure](#project-structure)
2. [Current Design Language](#current-design-language)
3. [Page-by-Page Map](#page-by-page-map)
4. [Shared Utilities](#shared-utilities)
5. [Design Improvements](#design-improvements)
6. [Implementation Order](#implementation-order)
7. [CSS Snippets](#css-snippets)

---

## Project Structure

```
readsync/
├── server.js                      # Express API (44 endpoints, ~3,300 lines)
├── chapter-update-bot-enhanced.js  # Puppeteer chapter scraper
├── tm-live.js                     # Userscript for progress capture
├── db-utils.js                    # PostgreSQL utilities
├── public/                        # Frontend (all vanilla HTML/JS/CSS)
│   ├── dashboard.html             # Home - stats overview
│   ├── dashboard-enhanced.html    # Modern dark variant with analytics
│   ├── mylist.html                # Novel library (sortable table, search, filters)
│   ├── novel.html                 # Novel detail (progress, sessions, bookmarks)
│   ├── admin.html                 # Bot control (real-time status, force updates)
│   ├── manage.html                # Bulk operations (status changes, deletions)
│   ├── explorer.html              # Novel browser/discovery
│   ├── settings.html              # User preferences
│   ├── login.html                 # Auth (API key entry, animated star bg)
│   ├── practice.html              # Dev/testing page
│   └── js/shared.js               # API client, toasts, formatting utils
├── docs/                          # Architecture docs, roadmap
├── dashboard.pen                  # Design exploration file (gitignored)
└── CLAUDE.md
```

---

## Current Design Language

### Color Tokens

All pages use CSS custom properties defined in each HTML file's `<style>` block:

| Token | Value | Role |
|-------|-------|------|
| `--primary` | `#6366f1` | Indigo - brand color, buttons, accents |
| `--primary-soft` | `rgba(99, 102, 241, 0.14)` | Transparent indigo for backgrounds |
| `--secondary` | `#8b5cf6` | Purple - gradients, hover states |
| `--bg` | `#020617` | Near-black main background |
| `--bg-card` | `#0f172a` | Dark slate card surfaces |
| `--bg-hover` | `#1e293b` | Lighter slate for hover states |
| `--text-primary` | `#e5e7eb` | Light gray body text |
| `--text-secondary` | `#9ca3af` | Muted gray for labels |
| `--text-muted` | `#6b7280` | Tertiary text |
| `--border-subtle` | `#1e293b` | Subtle borders |
| `--border-strong` | `#334155` | Prominent borders |
| `--success` | `#22c55e` | Green - positive states |
| `--danger` | `#ef4444` | Red - errors, destructive actions |
| `--warning` | `#f59e0b` | Amber - caution states |

### Typography

- **Font stack**: `system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`
- Some pages (dashboard-enhanced, admin) use `'Inter', -apple-system, ...`
- Headings: 2.5rem h1, weight 700, letter-spacing 0.02em
- Gradient text headers: `linear-gradient(135deg, #6366f1, #a855f7)` with `-webkit-background-clip: text`

### Components

| Component | Key Styles |
|-----------|-----------|
| **Cards** | `--bg-card` fill, 1px `--border-subtle`, 12px radius, hover lift (-2px translateY) |
| **Buttons** | Primary/success/danger/warning variants, 8px radius, `inline-flex`, 0.2s transition |
| **Tables** | Sticky thead on `#020617`, scrollable tbody, custom webkit scrollbar, uppercase 0.72rem headers |
| **Navigation** | Horizontal flex, gap 12px, bordered pill-style links, emoji icons |
| **Toasts** | Fixed bottom-right (100px, 24px), color-coded, slide-in animation |
| **Search** | 999px border-radius, icon-inside-input (absolute position) |

### Layout Patterns

- Container: max-width 1200-1400px, centered with `margin: 0 auto`
- CSS Grid: stat cards, device grids (`auto-fit, minmax()`)
- Flexbox: navigation, card rows, button groups
- Background: `radial-gradient(circle at top, #1f2933 0, #020617 55%)`
- **No CSS framework** - all custom CSS

### Border Radius Scale

| Size | Usage |
|------|-------|
| 8px | Buttons, inputs |
| 12px | Cards (standard) |
| 16px | Large panels |
| 999px | Search bars (pill) |

---

## Page-by-Page Map

| Page | File | Key Sections | Data Displayed |
|------|------|-------------|----------------|
| Dashboard | `dashboard.html` | Stats grid, novel list, quick nav | Reading count, chapters, recent activity |
| Dashboard Enhanced | `dashboard-enhanced.html` | Analytics cards, progress charts | Extended stats, device breakdown |
| MyList | `mylist.html` | Search/filter bar, sortable table | All novels: status, progress %, chapters |
| Novel Detail | `novel.html` | Header, progress timeline, sessions | Per-novel history, device usage, bookmarks |
| Admin | `admin.html` | Bot status panel, novel scanner | Real-time bot progress, stale detection |
| Manage | `manage.html` | Bulk action toolbar, selection table | Status changes, deletions, organization |
| Explorer | `explorer.html` | Browse/search interface | Novel discovery |
| Settings | `settings.html` | Form sections | User prefs, API key management |
| Login | `login.html` | Centered card, star animation | API key input |
| Practice | `practice.html` | Dev playground | Testing |

### Navigation Flow

```
Login → Dashboard → MyList → Novel Detail
                  → Admin → Manage
                  → Explorer
                  → Settings
```

- Nav links between pages via `<a>` tags in header
- Breadcrumb navigation in detail pages
- Back links with arrow character (←)

---

## Shared Utilities

**File**: `public/js/shared.js`

| Function | Purpose |
|----------|---------|
| `getApiKey()` / `setApiKey()` / `hasApiKey()` | localStorage API key management |
| `getJSON(path, options)` | Unified fetch with auto API key injection + cache busting |
| `toast(message, type, duration)` | Pop-up notifications (success/error/warning/info) |
| `showError(message, target, timeout)` | Error display |
| `formatTimestamp(ts, options)` | Relative time formatting ("5m ago", "2h ago") |
| `escapeHtml(text)` | XSS prevention |
| `copyResumeLink(url, percent)` | Clipboard with fallback |
| `$(id)` | `getElementById` shorthand |
| `domReady(callback)` | DOM ready detection |

---

## Design Improvements

Sourced from Pencil MCP's **Terminal Minimal** style guide analysis. These complement ReadSync's existing dark theme and indigo/purple palette.

### A. Typography Upgrade (High Impact)

**Problem**: All text uses the same `system-ui` font stack. Numeric data (chapter counts, progress percentages, streak days) doesn't stand out.

**Solution**: Add a monospace font for metrics and data values. Keep `system-ui` for body text.

| Element | Current | Proposed |
|---------|---------|----------|
| Chapter counts | `system-ui` | `JetBrains Mono` / `Fira Code` |
| Progress % | `system-ui` | Monospace |
| Stat values | `system-ui` | Monospace, bold |
| Section labels | Regular case | `uppercase` + `letter-spacing: 0.1em` |

**Why**: Monospace fonts give numbers equal width (alignment in tables), add a technical/data-focused feel, and create clear visual separation between "reading text" and "data text."

### B. Spacing Consistency (High Impact)

**Problem**: Each page defines spacing independently. Values vary (8px, 10px, 15px, 20px, 24px, etc.).

**Solution**: Standardize on an 8px-based spacing scale using shared CSS variables.

| Token | Value | Use For |
|-------|-------|---------|
| `--space-xs` | 4px | Tight internal gaps |
| `--space-sm` | 8px | Icon-to-text gaps, compact padding |
| `--space-md` | 12px | List item gaps, card internal gaps |
| `--space-lg` | 16px | Section internal gaps, form field gaps |
| `--space-xl` | 24px | Section-to-section gaps, card padding |
| `--space-2xl` | 32px | Major section gaps, page padding |

### C. Status Indicators (Medium Impact)

**Problem**: Novel status (reading, completed, on-hold, dropped) uses color-coded text labels only. Hard to scan quickly in long tables.

**Solution**: Add terminal-style status characters alongside color for dual-channel communication.

| Status | Character | Color |
|--------|-----------|-------|
| Reading | `◐` | `--primary` (#6366f1) |
| Completed | `✓` | `--success` (#22c55e) |
| On Hold | `○` | `--warning` (#f59e0b) |
| Dropped | `✕` | `--danger` (#ef4444) |
| Removed | `—` | `--text-muted` (#6b7280) |

**Why**: Scannable at a glance. Accessible (not color-only). Fits the dark/technical aesthetic.

### D. Progress Bars (Medium Impact)

**Problem**: Progress bars are basic with no visible track at 0% and chunky default styling.

**Solution**: Refined thin progress bars with visible track background.

| Property | Current | Proposed |
|----------|---------|----------|
| Height | ~10-16px | 6-8px |
| Corner radius | Default | 3-4px |
| Track color | None/transparent | `--bg-hover` (#1e293b) |
| Fill color | `--primary` | `--primary` (keep) |

### E. Depth Without Shadows (Medium Impact)

**Problem**: Cards use `box-shadow` for depth, which creates muddy halos in dark mode.

**Solution**: Use layered background colors for cleaner depth perception.

```
Layer 0 (page):  --bg        (#020617) - deepest
Layer 1 (card):  --bg-card   (#0f172a) - elevated surface
Layer 2 (inset): --bg-hover  (#1e293b) - nested elements inside cards
```

- Remove `box-shadow` from cards at rest
- Keep border on hover only (1px `--border-subtle`)
- The fill contrast between layers creates natural depth

### F. Navigation Polish (Low Impact)

**Problem**: Emoji icons in nav links, no clear active-page indicator.

**Solution**: Replace emojis with Lucide icon font for consistent sizing and professional look. Add active state.

| Nav Item | Current | Proposed Icon |
|----------|---------|---------------|
| Dashboard | Emoji | `layout-dashboard` |
| MyList | Emoji | `book-open` |
| Admin | Emoji | `shield` |
| Settings | Emoji | `settings` |
| Manage | Emoji | `sliders` |
| Explorer | Emoji | `compass` |

Active state: `background: var(--primary); color: white;` on current page link.

---

## Implementation Order

When ready to implement, follow this priority order across all pages:

| Step | Improvement | Files | Effort |
|------|------------|-------|--------|
| 1 | Typography (mono font + section labels) | All HTML pages | Small - add font import + CSS classes |
| 2 | Spacing tokens | All HTML pages, `shared.js` | Small - add `:root` vars, find-replace |
| 3 | Status indicators | `mylist.html`, `novel.html` | Small - update status rendering JS |
| 4 | Progress bars | `mylist.html`, `novel.html`, `dashboard-enhanced.html` | Small - CSS only |
| 5 | Depth refinement (layered fills) | All pages with cards | Medium - remove shadows, adjust borders |
| 6 | Navigation (Lucide icons + active states) | All pages with nav | Medium - add icon font, update nav HTML |

### Target Files

- `public/dashboard.html`
- `public/dashboard-enhanced.html`
- `public/mylist.html`
- `public/novel.html`
- `public/admin.html`
- `public/manage.html`
- `public/explorer.html`
- `public/settings.html`
- `public/login.html`
- `public/js/shared.js`

---

## CSS Snippets

Ready-to-use CSS for each improvement.

### Typography

```css
/* Add to <head> of every page */
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet">

/* Add to :root */
:root {
  --font-body: system-ui, -apple-system, 'Segoe UI', sans-serif;
  --font-mono: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace;
}

/* Apply to metric elements */
.stat-value,
.chapter-count,
.progress-percent,
.device-count,
td[data-type="number"] {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
}

/* Section labels */
.section-label,
th {
  text-transform: uppercase;
  letter-spacing: 0.1em;
  font-size: 0.7rem;
  font-weight: 600;
  color: var(--text-secondary);
}
```

### Spacing Tokens

```css
:root {
  --space-xs: 4px;
  --space-sm: 8px;
  --space-md: 12px;
  --space-lg: 16px;
  --space-xl: 24px;
  --space-2xl: 32px;
}
```

### Status Indicators

```javascript
// Status character mapping (add to shared.js or inline)
const STATUS_ICONS = {
  reading:   { char: '◐', color: 'var(--primary)' },
  completed: { char: '✓', color: 'var(--success)' },
  'on-hold': { char: '○', color: 'var(--warning)' },
  dropped:   { char: '✕', color: 'var(--danger)' },
  removed:   { char: '—', color: 'var(--text-muted)' }
};

function renderStatus(status) {
  const s = STATUS_ICONS[status] || STATUS_ICONS.removed;
  return `<span class="status-indicator" style="color:${s.color}">${s.char}</span> ${status}`;
}
```

```css
.status-indicator {
  font-family: var(--font-mono);
  font-weight: 700;
  margin-right: 6px;
}
```

### Progress Bars

```css
.progress-bar-track {
  width: 100%;
  height: 6px;
  background: var(--bg-hover);
  border-radius: 3px;
  overflow: hidden;
}

.progress-bar-fill {
  height: 100%;
  background: var(--primary);
  border-radius: 3px;
  transition: width 0.3s ease;
}
```

### Depth (Shadow-Free Cards)

```css
.card {
  background: var(--bg-card);
  border: 1px solid transparent;
  border-radius: 12px;
  transition: border-color 0.2s ease;
}

.card:hover {
  border-color: var(--border-subtle);
}

/* Nested elements inside cards */
.card-inset {
  background: var(--bg-hover);
  border-radius: 8px;
}
```

### Navigation (Lucide Icons)

```html
<!-- Add to <head> -->
<link href="https://unpkg.com/lucide-static@latest/font/lucide.css" rel="stylesheet">
```

```css
.nav-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  color: var(--text-secondary);
  text-decoration: none;
  transition: all 0.2s ease;
}

.nav-link:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.nav-link.active {
  background: var(--primary);
  border-color: var(--primary);
  color: white;
}
```

---

## Verification Checklist

When implementing any of the above changes, verify:

- [ ] Monospace font loads correctly (check network tab for Google Fonts)
- [ ] Numeric values (chapters, %, counts) display in monospace
- [ ] Spacing is consistent across sections on each page
- [ ] Status characters render correctly in MyList table rows
- [ ] Progress bars show visible track at 0% and fill at various %
- [ ] Cards have clean depth without muddy shadow halos
- [ ] No layout shifts or broken responsive behavior
- [ ] Full app flow works: login -> dashboard -> mylist -> novel detail -> admin
- [ ] Mobile responsive at 375px and 768px breakpoints
