# ReadSync - Visual Project Map

## 🗺️ Project Navigation Map

```
ReadSync System
│
├── 🏠 USER INTERFACES (Frontend HTML Pages)
│   │
│   ├── 📊 dashboard.html (Classic Home)
│   │   ├── Reading statistics
│   │   ├── Recent novels
│   │   ├── Quick links
│   │   └── Navigation hub
│   │
│   ├── 📊 dashboard-enhanced.html (Modern Dark Home)
│   │   ├── Enhanced statistics
│   │   ├── Dark theme UI
│   │   ├── Glassmorphism effects
│   │   └── Better analytics
│   │
│   ├── 📚 mylist.html (Novel Library) ⭐
│   │   ├── Sortable table (8 columns)
│   │   ├── Search & filter
│   │   ├── Status management
│   │   ├── Continue reading links
│   │   └── ✨ Auto-refresh (3 min)
│   │
│   ├── 📖 novel.html (Novel Details)
│   │   ├── Progress history
│   │   ├── Reading sessions
│   │   ├── Bookmarks
│   │   ├── Device breakdown
│   │   └── Chapter info
│   │
│   ├── 🛠️ admin.html (Admin Panel) ⭐
│   │   ├── Bot status monitor
│   │   ├── ✨ Real-time progress
│   │   ├── Stale novels list
│   │   ├── ✨ Force update (FIXED)
│   │   └── Manual triggers
│   │
│   └── 🔧 manage.html (Novel Management)
│       ├── Bulk operations
│       ├── Status changes
│       ├── Soft/hard delete
│       └── Search & filter
│
├── ⚙️ BACKEND (Server)
│   │
│   └── 🖥️ server.js (Main API Server)
│       ├── Express.js app
│       ├── 44 REST endpoints
│       ├── PostgreSQL connection
│       ├── Authentication
│       ├── Progress tracking
│       ├── Novel management
│       ├── Admin APIs
│       ├── Bookmarks
│       ├── Sessions
│       ├── Devices
│       └── Notifications
│
├── 🤖 AUTOMATION (Background Bot)
│   │
│   └── 🔄 chapter-update-bot-enhanced.js
│       ├── Runs every 30 min
│       ├── Web scraping (NovelBin)
│       ├── Chapter detection
│       ├── Metadata extraction
│       ├── Database updates
│       ├── Notification creation
│       └── Manual triggers
│
└── 💾 DATABASE (PostgreSQL)
    ├── users
    ├── novels
    ├── progress_snapshots
    ├── bookmarks
    ├── reading_sessions
    ├── devices
    └── notifications
```

---

## 🔄 Data Flow Diagram

### Reading Progress Flow

```
User reads on NovelBin
         ↓
   Userscript captures
   progress at intervals
         ↓
   POST /api/v1/progress
         ↓
   server.js validates
   & saves to database
         ↓
   PostgreSQL stores
   progress_snapshot
         ↓
   Other devices pull
   latest via GET
```

### Chapter Update Flow

```
   Bot timer (30 min)
         ↓
   Queries stale novels
   (not checked in 24h)
         ↓
   Fetches novel pages
   (10 at a time)
         ↓
   Parses HTML for:
   - Chapter number
   - Chapter title
   - Genres
   - Author
   - Update time
         ↓
   Compares with DB
         ↓
   If new chapter found:
   - Update novels table
   - Create notifications
         ↓
   Frontend auto-refreshes
   to show new data
```

### Admin Update Flow (After Fixes)

```
Admin clicks "Force Update All"
         ↓
   POST /admin/force-refresh-all
         ↓
   server.js marks all
   novels as stale
         ↓
   ✅ Triggers bot.updateNovelChapters()
   (was broken before fix)
         ↓
   Bot starts processing
         ↓
   Admin panel polls
   GET /api/v1/admin/bot/progress
   every 3 seconds
         ↓
   Shows live updates:
   "🔄 Updating... (15 checked, 8 updated, 32 left)"
         ↓
   Refreshes table every 5 novels
         ↓
   Novels disappear as updated
         ↓
   When done: "✅ All novels updated!"
```

---

## 🎭 User Journey Maps

### Journey 1: New Reader

```
1. Get API key from ReadSync
2. Open dashboard.html
3. Enter API key → Stored in localStorage
4. View empty library
5. Start reading on NovelBin with userscript
6. Progress automatically syncs
7. Novel appears in MyList
8. View progress on dashboard
```

### Journey 2: Multi-Device Reader

```
1. Reading on phone (Chapter 45)
2. Progress saved via userscript
3. Switch to laptop
4. Open same novel
5. Userscript loads latest progress
6. Continue from Chapter 45
7. Both devices stay synced
```

### Journey 3: Checking for Updates

```
1. Open mylist.html
2. See novel "Last updated: 2h ago"
3. Wait 3 minutes
4. ✨ Page auto-refreshes
5. See "Last updated: Just now"
6. Notice new chapter available
7. Click "Continue Reading"
```

### Journey 4: Admin Managing Updates

```
1. Open admin.html
2. Enter API key
3. See "Novels Needing Updates" list
4. Click "Force Global Update All"
5. ✨ See live progress counter
6. Watch novels disappear from list
7. Receive "✅ All novels updated!" message
8. View updated chapter counts
```

---

## 📱 Screen Layouts

### MyList (Library View)

```
┌─────────────────────────────────────────────┐
│  📚 MyList - ReadSync           [Search▼]   │
├─────────────────────────────────────────────┤
│ [Search...] [Status▼] Legend: ↑Last Read   │
├─────────────────────────────────────────────┤
│ Cover│Title      │Prog│Continue│Status│Read│
├─────┼───────────┼────┼────────┼──────┼────┤
│ [📷] │Novel 1 ★  │45% │→ Read  │📘    │2h  │
│ [📷] │Novel 2    │12% │→ Read  │📗    │1d  │
│ [📷] │Novel 3    │100%│  Done  │✓     │1w  │
└─────────────────────────────────────────────┘
      ↑ Auto-refreshes every 3 min ✨
```

### Admin Panel

```
┌─────────────────────────────────────────────┐
│  🔧 Admin Panel - ReadSync                  │
├─────────────────────────────────────────────┤
│ [API Key: ************]  [Connect]          │
├─────────────────────────────────────────────┤
│ Status                                       │
│ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐            │
│ │ Bot │ │Last │ │Upd. │ │Next │            │
│ │ ✅  │ │Just │ │ 0   │ │30m  │            │
│ └─────┘ └─────┘ └─────┘ └─────┘            │
├─────────────────────────────────────────────┤
│ Controls                                     │
│ [⚡ Trigger] [🔄 Refresh] [📚 Update All]   │
│              ↓ When clicked ↓               │
│    🔄 Updating... (15 checked, 8 updated,   │
│                   32 left) ✨               │
├─────────────────────────────────────────────┤
│ Novels Needing Updates                      │
│ ┌───────────────────────────────┐           │
│ │ Novel 1      Ch.45  2d ago  [Update]     │
│ │ Novel 2      Ch.12  3d ago  [Update]     │
│ │ Novel 3      Ch.89  1w ago  [Update]     │
│ └───────────────────────────────┘           │
│       ↑ Disappears when updated ✨          │
└─────────────────────────────────────────────┘
```

---

## 🔗 API Endpoint Categories

### 📝 Authentication (1)

```
GET  /api/v1/auth/whoami
```

### 📊 Progress (3)

```
POST /api/v1/progress          - Save progress
GET  /api/v1/progress          - Get progress
GET  /api/v1/compare           - Compare devices
```

### 📚 Novels (10)

```
GET    /api/v1/novels                      - List all
PUT    /api/v1/novels/:id/status           - Update status
DELETE /api/v1/novels/:id                  - Remove
POST   /api/v1/novels/:id/favorite         - Mark favorite
DELETE /api/v1/novels/:id/favorite         - Unfavorite
GET    /api/v1/novels/completed            - List completed
GET    /api/v1/novels/favorites            - List favorites
PUT    /api/v1/novels/:id/notes            - Update notes
GET    /api/v1/admin/novels/stale          - Stale novels
POST   /api/v1/admin/novels/:id/update     - Manual update
```

### 🤖 Admin/Bot (4)

```
GET  /api/v1/admin/bot/status              - Bot status
POST /api/v1/admin/bot/trigger             - Trigger bot
GET  /api/v1/admin/bot/progress  ✨ NEW    - Live progress
POST /admin/force-refresh-all    ✨ FIXED  - Update all
```

### 🔖 Bookmarks (5)

```
GET    /api/v1/bookmarks/:novelId          - Novel bookmarks
GET    /api/v1/bookmarks                   - All bookmarks
POST   /api/v1/bookmarks                   - Create
PUT    /api/v1/bookmarks/:id               - Update
DELETE /api/v1/bookmarks/:id               - Delete
```

### 📖 Sessions (6)

```
GET  /api/v1/sessions                      - List all
GET  /api/v1/sessions/:novelId             - Novel sessions
GET  /api/v1/sessions/active               - Active only
POST /api/v1/sessions                      - Start session
PUT  /api/v1/sessions/:id/end              - End session
```

### 💻 Devices (2)

```
GET  /api/v1/devices                       - List devices
PUT  /api/v1/devices/:id                   - Update device
```

---

## 🎯 Feature Matrix

| Feature | Dashboard | MyList | Novel | Admin | Manage |
|---------|-----------|--------|-------|-------|--------|
| View Statistics | ✅ | ❌ | ❌ | ✅ | ❌ |
| List Novels | ✅ | ✅ | ❌ | ❌ | ✅ |
| Novel Details | ❌ | ❌ | ✅ | ❌ | ❌ |
| Change Status | ❌ | ✅ | ✅ | ❌ | ✅ |
| Delete Novel | ❌ | ❌ | ❌ | ❌ | ✅ |
| View Progress | ✅ | ✅ | ✅ | ❌ | ❌ |
| Bot Control | ❌ | ❌ | ❌ | ✅ | ❌ |
| Auto-refresh | ❌ | ✅ | ❌ | ✅ | ❌ |
| Search/Filter | ❌ | ✅ | ❌ | ❌ | ✅ |
| Bookmarks | ❌ | ❌ | ✅ | ❌ | ❌ |
| Sessions | ❌ | ❌ | ✅ | ❌ | ❌ |

---

## 🚦 Status Indicators

### Novel Statuses

```
📘 Reading    - Currently reading
✅ Completed  - Finished
⏸️ On-hold    - Paused
❌ Dropped    - Abandoned
🗑️ Removed    - Hidden/deleted
```

### Bot States

```
✅ Running    - Currently updating novels
⏹️ Idle       - Waiting for next cycle
⚠️ Error      - Failed last run
🔄 Starting   - Initializing
```

---

## 📦 Dependencies

### Backend (package.json)

```json
{
  "express": "^4.x",
  "pg": "^8.x",
  "cors": "^2.x"
}
```

### Frontend

```
None! Pure vanilla JavaScript
```

---

## 🎨 Color Palette

### Classic Theme

```css
Primary:    #667eea (Indigo)
Secondary:  #764ba2 (Purple)
Success:    #10b981 (Green)
Warning:    #f59e0b (Amber)
Danger:     #ef4444 (Red)
```

### Dark Theme

```css
Primary:    #6366f1 (Indigo)
Secondary:  #8b5cf6 (Purple)
Background: #0f172a (Dark Blue)
Card:       #1e293b (Slate)
Border:     #334155 (Gray)
```

---

## 🔐 Security Checklist

- [✅] API Key authentication
- [✅] Parameterized SQL queries
- [✅] Input validation
- [✅] XSS protection
- [✅] CORS configuration
- [✅] SSL/TLS support
- [⚠️] Rate limiting (structure ready)
- [⚠️] Session management (basic)
- [❌] 2FA (not implemented)
- [❌] OAuth (not implemented)

---

This map provides a complete visual overview of your ReadSync project structure, data flows, and features!
