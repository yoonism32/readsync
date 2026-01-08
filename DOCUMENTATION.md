# ReadSync Server.js - Line-by-Line Documentation

Complete reference for server.js with line numbers, purposes, and key logic explanations.

---

## Lines 1-3: File Header and Environment Setup

**Purpose:** Load environment variables from .env file

**Details:**

- `require('dotenv').config()` reads .env file and loads all key-value pairs into process.env
- Must be called FIRST before any code that uses environment variables
- Example: DATABASE_URL, SESSION_SECRET, ADMIN_PASSWORD_HASH

---

## Lines 5-13: Unhandled Error Prevention

**Purpose:** Prevent server crashes from unhandled errors

**Error Handlers:**

1. **unhandledRejection** (Lines 5-8) - Catches promises that reject without .catch() handlers
2. **uncaughtException** (Lines 10-13) - Catches synchronous errors not caught by try-catch

**Why:** Without these handlers, unhandled errors would crash the server silently

---

## Lines 15-25: Core Dependencies

**Line 15:** Express.js - Web framework for building REST API and routing
**Line 16:** express-session - Session management middleware for tracking logged-in users
**Line 17:** bcryptjs - Password hashing library (one-way encryption)
**Line 18:** pg Pool - PostgreSQL connection pool for database queries
**Line 19:** cors - Cross-Origin Resource Sharing middleware
**Line 20:** path - Node.js path utilities
**Line 21:** URL - URL parsing utilities
**Line 22:** express-validator - Input validation middleware (body, param, query validators)
**Line 23:** http.createServer - Create HTTP server for Express app
**Line 24:** socket.io - WebSocket library for real-time communication
**Line 25:** db-utils - Custom database utilities (createPool, forceNoVerify)

---

## Lines 27-37: Express App & Socket.IO Setup

**Line 27:** Initialize Express application
**Line 28:** Create HTTP server wrapping Express app (needed for Socket.IO)
**Lines 29-37:** Initialize Socket.IO with CORS configuration

**Socket.IO CORS Configuration:**

- **origin:** Allowed origins from ALLOWED_ORIGINS env var (comma-separated list)
- **Default origins:** readsync-n7zp.onrender.com, localhost:3000
- **methods:** Only GET and POST allowed
- **credentials:** true (allows cookies/auth headers)

---

## Lines 39-97: Configuration Constants

### Lines 41-42: Server Config

- DEFAULT_PORT = 3000
- PORT from env or default

### Lines 44-47: Database Pool Config

- DEFAULT_PG_POOL_MAX = 20 connections
- DEFAULT_PG_IDLE_TIMEOUT_MS = 30000 (30 seconds)
- DEFAULT_PG_CONNECTION_TIMEOUT_MS = 10000 (10 seconds)

### Lines 49-60: Request Body Size Limits

- MAX_BODY_SIZE = 10MB for JSON/text bodies
- MAX_URL_ENCODED_LIMIT = 10MB for form data

### Lines 62-87: Validation Constants

- MAX_NOVEL_TITLE_LENGTH = 500 chars
- MAX_AUTHOR_NAME_LENGTH = 200 chars
- MAX_GENRE_LENGTH = 100 chars
- MAX_DEVICE_ID_LENGTH = 255 chars
- MAX_DEVICE_LABEL_LENGTH = 100 chars
- MAX_URL_LENGTH = 2048 chars
- MIN_PERCENT = 0
- MAX_PERCENT = 100
- MAX_NOTE_LENGTH = 5000 chars
- MAX_CATEGORY_LENGTH = 50 chars

### Lines 89-97: Session Configuration

- SESSION_MAX_AGE_MS = 30 days (2,592,000,000 ms)
- SESSION_SECRET from env or default 'dev-secret-change-in-production'
- SESSION_COOKIE_SECURE = true in production, false in development

---

## Lines 99-105: Database Connection Pool Initialization

**Purpose:** Create PostgreSQL connection pool using db-utils

**Pool Configuration:**

- connectionString: DATABASE_URL from env (required)
- max: From PG_POOL_MAX env or default 20
- idleTimeoutMillis: From PG_IDLE_TIMEOUT env or default 30000
- connectionTimeoutMillis: From PG_CONNECTION_TIMEOUT env or default 10000

**Features:**

- SSL with rejectUnauthorized: false (via forceNoVerify)
- keepAlive: true
- statement_timeout: 30000ms
- query_timeout: 30000ms

---

## Lines 107-119: Middleware Setup

### Line 107: CORS Middleware

- Enabled for all routes with default config

### Line 108: JSON Body Parser

- Parses application/json requests up to 10MB

### Line 109: URL-Encoded Body Parser

- Parses application/x-www-form-urlencoded requests up to 10MB
- extended: true allows rich objects and arrays

### Lines 110-119: Session Middleware

**Configuration:**

- secret: SESSION_SECRET (signs session ID cookie)
- resave: false (don't save session if unmodified)
- saveUninitialized: false (don't create session until something stored)
- cookie.httpOnly: true (prevents JavaScript access to cookie, XSS protection)
- cookie.secure: SESSION_COOKIE_SECURE (HTTPS-only in production)
- cookie.maxAge: SESSION_MAX_AGE_MS (30 days)
- cookie.sameSite: 'lax' (CSRF protection, allows navigation from external sites)
- rolling: true (resets maxAge on every request, extending session lifetime)

---

## Lines 121-124: Static File Serving

**Line 121:** Serve files from public/ directory at root path
**Example:** /mylist.html → public/mylist.html

---

## Lines 126-195: Authentication Middleware

### Lines 126-135: requireAuth (Session-based Auth)

**Purpose:** Protect routes requiring logged-in user (web UI)

**Logic:**

- Check if req.session.userId exists
- If yes: proceed to next middleware
- If no: return 401 { error: 'Authentication required' }

**Used by:** Dashboard, MyList, Admin pages, HTML routes

---

### Lines 137-195: validateApiKey (API Key Auth)

**Purpose:** Protect routes requiring API key (userscript)

**Key Sources:**

1. X-API-Key header (primary)
2. ?key= query parameter (fallback)

**Validation Flow:**

1. Extract api_key from header or query
2. If missing: return 401 'API key required'
3. Query database: SELECT * FROM users WHERE api_key = $1
4. If not found: return 401 'Invalid API key'
5. If found: Attach user object to req.user, proceed to next

**User Object Attached:** { id, display_name, api_key, created_at }

---

## Lines 197-201: Validation Error Handler

**Purpose:** Centralized handler for express-validator errors

**Logic:**

1. Extract validation errors with validationResult(req)
2. If no errors: proceed to next middleware
3. If errors exist: return 400 with { errors: [...] } array

**Error Format:** Each error contains field name, value, and message

---

## Lines 203-449: Database Schema Creation

### Lines 205-216: novels Table

**Columns:**

- id SERIAL PRIMARY KEY
- title VARCHAR(500) NOT NULL
- author VARCHAR(200)
- genre VARCHAR(100)
- primary_url TEXT UNIQUE
- cover_img TEXT
- latest_chapter_num INTEGER
- latest_chapter_title TEXT
- description TEXT
- last_updated TIMESTAMP DEFAULT NOW()
- created_at TIMESTAMP DEFAULT NOW()

**Purpose:** Store novel catalog with latest chapter info

---

### Lines 218-225: users Table

**Columns:**

- id SERIAL PRIMARY KEY
- display_name VARCHAR(255) NOT NULL
- api_key VARCHAR(255) UNIQUE NOT NULL
- created_at TIMESTAMP DEFAULT NOW()

**Purpose:** Store user accounts (single user system, id=1)

---

### Lines 227-238: devices Table

**Columns:**

- id SERIAL PRIMARY KEY
- user_id INTEGER REFERENCES users(id) ON DELETE CASCADE
- device_label VARCHAR(100) NOT NULL
- device_type VARCHAR(50)
- last_seen TIMESTAMP DEFAULT NOW()
- active BOOLEAN DEFAULT TRUE
- created_at TIMESTAMP DEFAULT NOW()

**Indexes:**

- idx_devices_user_id ON (user_id)

**Purpose:** Track user's devices for multi-device sync

---

### Lines 240-254: progress_snapshots Table

**Columns:**

- id SERIAL PRIMARY KEY
- user_id INTEGER REFERENCES users(id) ON DELETE CASCADE
- device_id INTEGER REFERENCES devices(id) ON DELETE CASCADE
- novel_id INTEGER REFERENCES novels(id) ON DELETE CASCADE
- chapter_num INTEGER NOT NULL
- percent DECIMAL(5,2) NOT NULL
- url TEXT
- seconds_on_page INTEGER DEFAULT 0
- created_at TIMESTAMP DEFAULT NOW()

**Indexes:**

- idx_progress_novel_created ON (novel_id, created_at DESC)
- idx_progress_user_novel ON (user_id, novel_id)

**Purpose:** Store all progress updates with history (forward-only via max-progress policy)

---

### Lines 256-269: user_novel_meta Table

**Columns:**

- user_id INTEGER REFERENCES users(id) ON DELETE CASCADE
- novel_id INTEGER REFERENCES novels(id) ON DELETE CASCADE
- status VARCHAR(50) DEFAULT 'reading'
- last_read_chapter INTEGER DEFAULT 0
- last_read_at TIMESTAMP
- added_at TIMESTAMP DEFAULT NOW()
- PRIMARY KEY (user_id, novel_id)

**Indexes:**

- idx_user_novel_status ON (user_id, status)

**Purpose:** User's reading list with status (reading/completed/dropped/plan-to-read)

---

### Lines 271-283: bookmarks Table

**Columns:**

- id SERIAL PRIMARY KEY
- user_id INTEGER REFERENCES users(id) ON DELETE CASCADE
- novel_id INTEGER REFERENCES novels(id) ON DELETE CASCADE
- chapter_num INTEGER NOT NULL
- note TEXT
- created_at TIMESTAMP DEFAULT NOW()

**Indexes:**

- idx_bookmarks_user_novel ON (user_id, novel_id, chapter_num)

**Purpose:** Save specific chapters with optional notes

---

### Lines 285-299: reading_sessions Table

**Columns:**

- id SERIAL PRIMARY KEY
- user_id INTEGER REFERENCES users(id) ON DELETE CASCADE
- novel_id INTEGER REFERENCES novels(id) ON DELETE CASCADE
- device_id INTEGER REFERENCES devices(id) ON DELETE SET NULL
- chapter_num INTEGER NOT NULL
- start_time TIMESTAMP NOT NULL
- end_time TIMESTAMP NOT NULL
- duration_seconds INTEGER NOT NULL
- created_at TIMESTAMP DEFAULT NOW()

**Indexes:**

- idx_sessions_user_novel ON (user_id, novel_id, start_time DESC)

**Purpose:** Track reading time for statistics

---

### Lines 301-316: novel_notes Table

**Columns:**

- id SERIAL PRIMARY KEY
- user_id INTEGER REFERENCES users(id) ON DELETE CASCADE
- novel_id INTEGER REFERENCES novels(id) ON DELETE CASCADE
- chapter_num INTEGER
- note_text TEXT NOT NULL
- created_at TIMESTAMP DEFAULT NOW()
- updated_at TIMESTAMP DEFAULT NOW()

**Indexes:**

- idx_notes_user_novel ON (user_id, novel_id, chapter_num)

**Purpose:** User annotations per chapter

---

### Lines 318-330: user_settings Table

**Columns:**

- user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE
- sync_enabled BOOLEAN DEFAULT TRUE
- theme VARCHAR(50) DEFAULT 'dark'
- notifications_enabled BOOLEAN DEFAULT TRUE
- created_at TIMESTAMP DEFAULT NOW()
- updated_at TIMESTAMP DEFAULT NOW()

**Purpose:** User preferences

---

### Lines 332-343: novel_categories Table

**Columns:**

- user_id INTEGER REFERENCES users(id) ON DELETE CASCADE
- novel_id INTEGER REFERENCES novels(id) ON DELETE CASCADE
- category VARCHAR(50) NOT NULL
- PRIMARY KEY (user_id, novel_id, category)

**Indexes:**

- idx_categories_user_category ON (user_id, category)

**Purpose:** Organize novels into custom categories

---

### Lines 345-366: Admin User Initialization

**Purpose:** Ensure admin user exists with API key

**Logic:**

1. Try to find user with id=1
2. If not found:
   - Generate random UUID for api_key using crypto.randomUUID()
   - Insert user with id=1, display_name='Admin', api_key
   - Log api_key for first-time setup
3. If found and no api_key:
   - Generate and update api_key
   - Log new api_key

**Environment Integration:**

- If API_KEY env var set: use it instead of generating
- If ADMIN_PASSWORD_HASH env var set: passwords are validated

**First Run:** Prints api_key to console for copying to userscript

---

## Lines 368-449: Utility Functions

### Lines 370-381: detectDeviceType(userAgent)

**Purpose:** Parse device type from User-Agent string

**Logic:**

1. If /Android/i: return 'Mobile'
2. If /iPhone/i: return 'Mobile'
3. If /iPad/i: return 'Tablet'
4. If /Mobile/i: return 'Mobile'
5. Otherwise: return 'Desktop'

**Returns:** 'Mobile', 'Tablet', 'Desktop', or 'Unknown'

---

### Lines 383-395: normalizeNovelId(val)

**Purpose:** Convert various novel identifier formats to integer ID

**Logic:**

1. If number: return as-is
2. If string number: parse to int
3. If string URL: extract ID from path
4. Otherwise: return null

**Returns:** Integer ID or null

---

### Lines 397-407: parseChapterFromUrl(url)

**Purpose:** Extract chapter number from NovelBin URL

**Regex:** /chapter-(\d+)/

**Examples:**

- <https://novelbin.me/novel-123/chapter-45> → 45
- /chapter-100 → 100

**Returns:** Integer chapter number or null

---

### Lines 409-449: getLatestStates(userId, novelId)

**Purpose:** Get latest progress across all devices and per-device

**Query Logic:**

1. SELECT MAX(chapter_num), MAX(percent), device_id
2. FROM progress_snapshots
3. WHERE user_id = $1 AND novel_id = $2
4. GROUP BY device_id

**Returns:** { latest_global: { chapter_num, percent }, latest_per_device: [...] }

**Use Case:** Compare incoming progress against current max to enforce forward-only policy

---

## Lines 451-525: Authentication Endpoints

### Lines 453-490: POST /api/auth/login

**Purpose:** Authenticate user and create session

**Validation:**

- username: required string
- password: required string

**Logic:**

1. Get ADMIN_USERNAME and ADMIN_PASSWORD_HASH from env
2. Check username matches ADMIN_USERNAME
3. Use bcrypt.compare() to verify password against hash
4. If valid: Set req.session.userId = 1, return success
5. If invalid: Return 401 'Invalid credentials'

**Security:** Password never stored in plain text, session ID cookie set automatically

---

### Lines 492-507: POST /api/auth/logout

**Purpose:** Destroy user session

**Auth:** requireAuth

**Logic:**

1. Call req.session.destroy()
2. Clear session cookie with res.clearCookie('connect.sid')
3. Return { success: true }

---

### Lines 509-525: GET /api/auth/check

**Purpose:** Verify session validity and return user info

**Auth:** requireAuth

**Logic:**

1. Get userId from req.session.userId
2. Query users table for user details
3. Return { authenticated: true, userId, user: {...} }

---

## Lines 527-797: Progress Tracking Endpoints

### Lines 529-656: POST /api/v1/progress

**Purpose:** Record reading progress from userscript

**Validation:**

- novelTitle: string, 1-500 chars, required
- novelUrl: valid URL, required
- chapterNum: integer, required
- percent: float 0-100, required
- secondsOnPage: integer >= 0, optional
- deviceLabel: string, 1-100 chars, required
- current_chapter_num: integer, optional

**Auth:** validateApiKey

---

#### Lines 541-551: Chapter Detection Logic

**Purpose:** Determine chapter number from userscript or URL

**Two-Source Detection:**

1. **Priority:** Userscript direct value - If current_chapter_num provided in body, use it
2. **Fallback:** URL parsing - Otherwise parse from URL using parseChapterFromUrl()

**Why Two Sources:** Userscript can read chapter number from page DOM (more accurate) but URL parsing works as backup

**Debug Logging:** Logs both sources to help troubleshoot chapter detection issues

**Validation:** Returns 400 error if novel_id extraction or chapter detection fails

---

#### Lines 553-574: Novel Auto-Add Logic

**Purpose:** Automatically add novel to database if not exists

**Trigger Conditions:**

- Novel not in database AND
- (percent > 0 OR secondsOnPage > 5)

**Logic:**

1. Check if novel exists by primary_url
2. If not found: INSERT novel with title, url, genre from URL
3. Get newly created novel_id

**Why Auto-Add:** Simplifies userscript - no need to explicitly add novel before first progress update

---

#### Lines 576-594: Device Management Logic

**Purpose:** Create or update device record

**Logic:**

1. Query devices table for matching user_id + device_label
2. If found: UPDATE last_seen to NOW()
3. If not found:
   - Parse device_type from User-Agent using detectDeviceType()
   - INSERT new device with label, type, last_seen
   - Get device_id

**Result:** req.device = { id, label, type }

---

#### Lines 596-611: Max-Progress Policy Check

**Purpose:** Enforce forward-only chapter tracking

**Logic:**

1. Call getLatestStates(userId, novelId)
2. Get latest_global.chapter_num and latest_global.percent
3. Check if new progress is forward:
   - New chapter_num > current: ACCEPT
   - Same chapter AND new percent > current: ACCEPT
   - Otherwise: REJECT with 'rejected' status

**Why:** Prevents accidental backwards updates from out-of-order API calls, multiple devices syncing simultaneously, browser back button

**Response on Rejection:** { status: 'rejected', reason: 'max_progress_policy', current_latest: {...} }

---

#### Lines 613-627: Progress Snapshot Insert

**Purpose:** Store progress update in database

**Query:** INSERT INTO progress_snapshots (user_id, device_id, novel_id, chapter_num, percent, url, seconds_on_page) VALUES (...) RETURNING *

**Captures:** User, device, novel, chapter number, scroll percent, full URL, time spent, timestamp

---

#### Lines 629-640: Update user_novel_meta

**Purpose:** Track user's latest chapter in reading list

**Query:** INSERT INTO user_novel_meta ... ON CONFLICT (user_id, novel_id) DO UPDATE SET last_read_chapter, last_read_at

**Upsert Logic:** If row doesn't exist: create it. If exists: update last_read_chapter and last_read_at

---

#### Lines 642-656: WebSocket Broadcast & Response

**WebSocket Broadcast:**

1. Get socketId from request body (sender's socket)
2. Emit 'progress_update' to room user_${userId} EXCEPT sender
3. Payload: { novel_id, chapter_num, percent, device_label, latest_global, latest_per_device }

**Purpose:** Real-time sync to other devices without polling

**HTTP Response:** { status: 'success', novel_id, snapshot: {...}, latest_global: {...}, latest_per_device: [...] }

---

### Lines 658-692: GET /api/v1/progress/latest

**Purpose:** Get most recent progress for novel

**Auth:** validateApiKey

**Query Params:**

- novelId: integer, optional
- novelTitle: string, optional
- (One required)

**Logic:**

1. Normalize novelId using normalizeNovelId()
2. Query latest progress_snapshot: WHERE user_id AND novel_id ORDER BY created_at DESC LIMIT 1
3. Join with devices to get device_label

**Response:** { chapter_num, percent, last_read_at, device_label, url }

---

### Lines 694-747: GET /api/v1/progress/history

**Purpose:** Get paginated progress history for novel

**Auth:** validateApiKey

**Query Params:**

- novelId: integer, required
- limit: integer 1-200, default 50
- offset: integer >= 0, default 0

**Logic:**

1. Count total progress_snapshots for user+novel
2. Query paginated history: SELECT ... JOIN devices ... ORDER BY created_at DESC LIMIT/OFFSET

**Response:** { history: [...], total, limit, offset }

---

### Lines 749-797: GET /api/v1/progress/compare

**Purpose:** Compare progress across devices

**Auth:** validateApiKey

**Query Params:** novelId required

**Logic:**

1. Get latest_global and latest_per_device using getLatestStates()
2. For each device, calculate chapters_behind and percent_diff

**Response:** { novel_id, latest_global: {...}, devices: [{ device_id, chapter_num, chapters_behind, is_latest }, ...] }

**Use Case:** Show user which devices are caught up vs behind

---

## Lines 799-1097: Novel Management Endpoints

### Lines 801-845: POST /api/v1/novels

**Purpose:** Add novel to user's reading list

**Auth:** validateApiKey

**Validation:** title required (1-500 chars), url/author/genre/coverImg/description optional

**Logic:**

1. Check if novel exists by title (case-insensitive)
2. If not found: INSERT INTO novels
3. Check if already in user's list (user_novel_meta)
4. If not in list: INSERT INTO user_novel_meta with status='reading'

**Response:** { novel_id, novel: {...} }

---

### Lines 847-947: GET /api/v1/novels

**Purpose:** Get user's reading list with progress info

**Auth:** validateApiKey

**Query Params:**

- status: optional filter ('reading', 'completed', 'dropped', 'plan-to-read')
- includeProgress: boolean, default true

**Base Query:** SELECT n.*, m.status, m.last_read_chapter FROM user_novel_meta m JOIN novels n WHERE m.user_id ORDER BY last_read_at DESC

**Progress Enhancement:** For each novel, get latest progress_snapshot and calculate unread_chapters = latest_chapter_num - last_read_chapter

**Response:** { novels: [{ id, title, status, last_read_chapter, latest_chapter_num, unread_chapters, latest_progress: {...} }, ...] }

---

### Lines 949-994: GET /api/v1/novels/:id

**Purpose:** Get single novel details with full info

**Auth:** validateApiKey

**Logic:**

1. Query novels + user_novel_meta LEFT JOIN
2. Get latest progress_snapshot
3. Calculate unread_chapters

**Response:** { novel: {...}, progress: {...} }

---

### Lines 996-1038: PUT /api/v1/novels/:id

**Purpose:** Update novel metadata

**Auth:** validateApiKey

**Validation:** At least one of title, author, genre, description, coverImg, primaryUrl

**Logic:**

1. Build UPDATE query dynamically based on provided fields
2. Convert camelCase to snake_case
3. Execute UPDATE ... WHERE id = $N RETURNING *

**Response:** { novel: {...} }

---

### Lines 1040-1066: DELETE /api/v1/novels/:id

**Purpose:** Remove novel from user's reading list

**Auth:** validateApiKey

**Logic:** DELETE FROM user_novel_meta WHERE user_id AND novel_id

**Important:** Cascades to progress_snapshots, bookmarks, notes via FK constraints

**Note:** Does NOT delete from novels table (other users might be reading it)

---

### Lines 1068-1107: PUT /api/v1/novels/:id/status

**Purpose:** Update reading status

**Auth:** validateApiKey

**Validation:** status must be one of ['reading', 'completed', 'dropped', 'plan-to-read']

**Logic:** UPDATE user_novel_meta SET status WHERE user_id AND novel_id

**Response:** { novel_id, status }

---

### Lines 1109-1159: POST /api/v1/novels/:id/latest-chapter

**Purpose:** Manually update novel's latest chapter info

**Auth:** validateApiKey

**Validation:** chapterNum required (integer), chapterTitle optional

**Logic:** UPDATE novels SET latest_chapter_num, latest_chapter_title, last_updated = NOW() WHERE id RETURNING *

**Use Case:** Admin manually updates chapter info, bot updates after scraping

---

### Lines 1161-1214: GET /api/v1/novels/search

**Purpose:** Search novels by title

**Auth:** validateApiKey

**Query Params:** q required (min 1 char)

**Logic:** SELECT ... WHERE LOWER(title) LIKE LOWER('%' + query + '%') ORDER BY (in_list first, then alphabetically)

**Response:** { results: [{ id, title, author, in_list, status }, ...], count }

---

## Lines 1216-1493: Admin & Bot Management

### Lines 1218-1296: POST /api/admin/novels

**Purpose:** Bulk import novels via admin interface

**Auth:** requireAuth (session)

**Validation:** novels array required, each with title/url minimum

**Logic:**

1. Loop through novels array
2. For each: check if exists, insert if not, add to user's list
3. Track successes and failures

**Response:** { success: true, imported: count, failed: count, errors: [...] }

---

### Lines 1298-1378: GET /api/admin/check-updates

**Purpose:** Check for new chapters on NovelBin using Puppeteer

**Auth:** requireAuth

**Query Params:** primaryUrl required (must be NovelBin URL)

**Puppeteer Logic:**

1. Launch browser with --no-sandbox, --disable-setuid-sandbox
2. Open page with User-Agent
3. Navigate to primaryUrl with 30s timeout
4. Wait for '#list-chapter' selector
5. Extract chapter numbers from links
6. Get max chapter number
7. Close browser

**Comparison:** Compare scraped vs stored latest_chapter_num

**Response:** { hasUpdate: boolean, currentLatest, scrapedLatest, novel_url }

---

### Lines 1380-1448: POST /api/admin/bulk-check

**Purpose:** Check updates for multiple novels in parallel

**Auth:** requireAuth

**Validation:** novelIds array required

**Logic:**

1. Query novels: SELECT id, title, primary_url WHERE id IN (...)
2. Use Promise.all() to check each concurrently
3. Track results and errors

**Response:** { results: [{ novel_id, title, hasUpdate, currentLatest, scrapedLatest }, ...] }

**Performance:** Parallel execution speeds up bulk checks (~10 novels in 10 seconds vs 100 seconds)

---

### Lines 1450-1493: POST /api/admin/force-update

**Purpose:** Force update novel's chapter info without scraping

**Auth:** requireAuth

**Validation:** novelId, chapterNum, chapterTitle required

**Logic:** UPDATE novels SET latest_chapter_num, latest_chapter_title, last_updated = NOW() WHERE id

**Use Case:** Scraper failed but admin knows correct chapter, manual correction

---

## Lines 1495-1634: Userscript Auto-Update

### Lines 1497-1634: POST /api/v1/auto-update-novel

**Purpose:** Auto-detect and update novel info from userscript

**Auth:** validateApiKey

**Validation:** novelUrl required, novelTitle/latestChapterNum/latestChapterTitle/author/genre optional

**Find Novel Logic:**

1. Try to find by primary_url (exact match)
2. If not found and novelTitle provided: Try ILIKE on title
3. If still not found and latestChapterNum: auto-create novel

**Update Check:**

1. If latestChapterNum > novel.latest_chapter_num: UPDATE novels
2. If <=: No update needed

**Auto-Create:** If not found AND latestChapterNum: INSERT INTO novels

**Response:** { updated: boolean, novel: {...} }

---

## Lines 1636-1716: Settings API

### Lines 1638-1674: GET /api/v1/settings

**Purpose:** Get user settings

**Auth:** validateApiKey

**Logic:** SELECT * FROM user_settings WHERE user_id, return defaults if not found

**Defaults:** { sync_enabled: true, theme: 'dark', notifications_enabled: true }

---

### Lines 1676-1716: PUT /api/v1/settings

**Purpose:** Update user settings

**Auth:** validateApiKey

**Validation:** At least one of syncEnabled, theme, notificationsEnabled

**Logic:** UPSERT with ON CONFLICT: INSERT ... ON CONFLICT (user_id) DO UPDATE SET ... updated_at = NOW()

**Response:** { settings: {...} }

---

## Lines 1718-1836: Bookmarks API

### Lines 1720-1765: POST /api/v1/bookmarks

**Purpose:** Create bookmark for chapter

**Auth:** validateApiKey

**Validation:** novelId, chapterNum required; note optional (max 5000 chars)

**Logic:** INSERT INTO bookmarks (user_id, novel_id, chapter_num, note) VALUES (...) RETURNING *

---

### Lines 1767-1804: GET /api/v1/bookmarks

**Purpose:** Get all bookmarks for novel

**Auth:** validateApiKey

**Query Params:** novelId required

**Logic:** SELECT * FROM bookmarks WHERE user_id AND novel_id ORDER BY chapter_num ASC

---

### Lines 1806-1836: DELETE /api/v1/bookmarks/:id

**Purpose:** Delete bookmark

**Auth:** validateApiKey

**Logic:** DELETE FROM bookmarks WHERE id AND user_id (user_id check prevents deleting others' bookmarks)

---

## Lines 1838-2043: Reading Sessions API

### Lines 1840-1898: POST /api/v1/sessions

**Purpose:** Record reading session with duration

**Auth:** validateApiKey

**Validation:** novelId, deviceId, chapterNum, startTime, endTime required

**Logic:**

1. Calculate duration_seconds = (endTime - startTime) / 1000
2. INSERT INTO reading_sessions (...) RETURNING *

---

### Lines 1900-1973: GET /api/v1/sessions

**Purpose:** Get reading sessions history

**Auth:** validateApiKey

**Query Params:** novelId optional, limit (1-200, default 50), offset (default 0)

**Logic:**

1. Count total sessions
2. Query paginated: SELECT s.*, n.title, d.device_label FROM reading_sessions s JOIN novels n LEFT JOIN devices d ORDER BY start_time DESC

**Response:** { sessions: [...], total, limit, offset }

---

### Lines 1975-2043: GET /api/v1/sessions/summary

**Purpose:** Get reading time summary grouped by date

**Auth:** validateApiKey

**Query Params:** period ('day', 'week', 'month', default 'week')

**Period Calculations:**

- day: last 24 hours
- week: last 7 days
- month: last 30 days

**Logic:** SELECT DATE(start_time), SUM(duration_seconds), COUNT(*) FROM reading_sessions WHERE user_id AND start_time >= threshold GROUP BY DATE(start_time) ORDER BY date DESC

**Response:** { period, total_seconds, by_date: [{ date, total_seconds, session_count }, ...] }

---

## Lines 2045-2218: Device Management API

### Lines 2047-2081: GET /api/v1/devices

**Purpose:** Get user's registered devices

**Auth:** validateApiKey

**Logic:** SELECT * FROM devices WHERE user_id ORDER BY last_seen DESC

---

### Lines 2083-2138: PUT /api/v1/devices/:id

**Purpose:** Update device info

**Auth:** validateApiKey

**Validation:** At least one of deviceLabel, active

**Logic:** Build dynamic UPDATE, execute WHERE id AND user_id

---

### Lines 2140-2173: DELETE /api/v1/devices/:id

**Purpose:** Remove device

**Auth:** validateApiKey

**Logic:** DELETE FROM devices WHERE id AND user_id

**Important:** Cascades to progress_snapshots (deletes all progress from this device)

---

### Lines 2175-2218: POST /api/v1/devices/cleanup

**Purpose:** Mark stale devices as inactive

**Auth:** validateApiKey

**Query Params:** days (default 30)

**Logic:** UPDATE devices SET active = false WHERE user_id AND last_seen < (NOW() - INTERVAL 'days') AND active = true

**Use Case:** Automatically deactivate devices not seen in 30+ days

---

## Lines 2220-2535: Statistics API

### Lines 2222-2321: GET /api/v1/stats/overview

**Purpose:** Get reading statistics overview

**Auth:** validateApiKey

**Queries:**

1. Novel counts: COUNT(*) with FILTER for each status from user_novel_meta
2. Total chapters read: COUNT(DISTINCT (novel_id, chapter_num)) from progress_snapshots
3. Total reading time: SUM(duration_seconds) from reading_sessions
4. Current streak: Get dates with progress, count consecutive days from today

**Response:** { total_novels, reading, completed, dropped, plan_to_read, chapters_read, total_time_seconds, current_streak_days }

---

### Lines 2323-2410: GET /api/v1/stats/by-novel

**Purpose:** Get per-novel reading statistics

**Auth:** validateApiKey

**Query Params:** novelId optional

**Logic:** SELECT n.id, n.title, COUNT(DISTINCT ps.chapter_num) as chapters_read, SUM(rs.duration_seconds), MAX(ps.created_at) FROM novels n JOIN user_novel_meta LEFT JOIN progress_snapshots LEFT JOIN reading_sessions GROUP BY novel ORDER BY last_read_at DESC

**Response:** { stats: [{ novel_id, title, chapters_read, time_spent_seconds, last_read_at }, ...] }

---

### Lines 2412-2478: GET /api/v1/stats/recent

**Purpose:** Get recent reading activity grouped by date

**Auth:** validateApiKey

**Query Params:** days (1-90, default 7)

**Logic:** SELECT DATE(created_at), COUNT(DISTINCT chapter_num), SUM(seconds_on_page) FROM progress_snapshots WHERE user_id AND created_at >= start_date GROUP BY DATE ORDER BY date DESC

**Response:** { days, activity: [{ date, chapters, time_seconds }, ...] }

---

### Lines 2480-2535: GET /api/v1/stats/device-usage

**Purpose:** Get reading stats per device

**Auth:** validateApiKey

**Logic:** SELECT d.id, d.device_label, COUNT(DISTINCT ps.chapter_num), SUM(rs.duration_seconds), MAX(ps.created_at) FROM devices LEFT JOIN progress_snapshots LEFT JOIN reading_sessions GROUP BY device ORDER BY last_used_at DESC

**Response:** { device_stats: [{ device_id, device_label, device_type, chapters_read, time_spent_seconds, last_used_at }, ...] }

---

## Lines 2537-2680: Novel Notes API

### Lines 2539-2588: POST /api/v1/notes

**Purpose:** Create note for chapter

**Auth:** validateApiKey

**Validation:** novelId, chapterNum optional (null = general note), noteText required (1-5000 chars)

**Logic:** INSERT INTO novel_notes (user_id, novel_id, chapter_num, note_text, created_at, updated_at) VALUES (...) RETURNING *

---

### Lines 2590-2633: GET /api/v1/notes

**Purpose:** Get all notes for novel

**Auth:** validateApiKey

**Query Params:** novelId required

**Logic:** SELECT * FROM novel_notes WHERE user_id AND novel_id ORDER BY chapter_num ASC NULLS FIRST (general notes first)

---

### Lines 2635-2690: PUT /api/v1/notes/:id

**Purpose:** Update note text

**Auth:** validateApiKey

**Validation:** noteText required (1-5000 chars)

**Logic:** UPDATE novel_notes SET note_text, updated_at = NOW() WHERE id AND user_id

---

### Lines 2692-2680: DELETE /api/v1/notes/:id

**Purpose:** Delete note

**Auth:** validateApiKey

**Logic:** DELETE FROM novel_notes WHERE id AND user_id

---

## Lines 2682-2788: Bulk Operations API

### Lines 2684-2734: POST /api/v1/bulk/status

**Purpose:** Update status for multiple novels

**Auth:** validateApiKey

**Validation:** novelIds array required, status required

**Logic:** UPDATE user_novel_meta SET status WHERE user_id AND novel_id = ANY(novelIds)

**Use Case:** Mark multiple completed novels at once

---

### Lines 2736-2788: POST /api/v1/bulk/delete

**Purpose:** Delete multiple novels from reading list

**Auth:** validateApiKey

**Validation:** novelIds array required

**Logic:** DELETE FROM user_novel_meta WHERE user_id AND novel_id = ANY(novelIds)

**Important:** Cascades to progress_snapshots, bookmarks, notes

---

## Lines 2790-2994: Export/Import API

### Lines 2792-2883: GET /api/v1/export

**Purpose:** Export all user data as JSON backup

**Auth:** validateApiKey

**Exported Data:**

1. Novels + Reading List: SELECT n.*, m.* FROM user_novel_meta m JOIN novels n
2. Progress Snapshots: SELECT * FROM progress_snapshots WHERE user_id
3. Bookmarks: SELECT * FROM bookmarks WHERE user_id
4. Notes: SELECT * FROM novel_notes WHERE user_id
5. Categories: SELECT * FROM novel_categories WHERE user_id
6. Reading Sessions: SELECT * FROM reading_sessions WHERE user_id

**Response:** { novels: [...], progress: [...], bookmarks: [...], notes: [...], categories: [...], sessions: [...], exported_at }

---

### Lines 2885-2994: POST /api/v1/import

**Purpose:** Import data from JSON backup

**Auth:** validateApiKey

**Validation:** data object with at least 'novels' array

**Import Logic:**

1. Novels: For each, check if exists by title, insert if not, UPSERT user_novel_meta
2. Bookmarks: Map novel_ids, INSERT ... ON CONFLICT DO NOTHING
3. Notes: Map novel_ids, INSERT ... ON CONFLICT DO NOTHING
4. Categories: Map novel_ids, INSERT ... ON CONFLICT DO NOTHING

**Note:** Progress snapshots and reading sessions NOT imported (too large)

**Response:** { success: true, imported: { novels, bookmarks, notes, categories } }

---

## Lines 2996-3126: Categories API

### Lines 2998-3045: POST /api/v1/categories

**Purpose:** Add novel to category

**Auth:** validateApiKey

**Validation:** novelId, category required (1-50 chars)

**Logic:** INSERT INTO novel_categories (user_id, novel_id, category) VALUES (...) ON CONFLICT DO NOTHING

---

### Lines 3047-3090: GET /api/v1/categories

**Purpose:** Get categories for novel or all categories

**Auth:** validateApiKey

**Query Params:** novelId optional

**Logic:**

- If novelId: SELECT category FROM novel_categories WHERE user_id AND novel_id
- If no novelId: SELECT DISTINCT category FROM novel_categories WHERE user_id

---

### Lines 3092-3126: DELETE /api/v1/categories

**Purpose:** Remove novel from category

**Auth:** validateApiKey

**Validation:** novelId, category required

**Logic:** DELETE FROM novel_categories WHERE user_id AND novel_id AND category

---

## Lines 3128-3186: HTML Routes

All routes use requireAuth middleware (session-based)

**GET /** → public/dashboard.html
**GET /mylist** → public/mylist.html
**GET /novel/:id** → public/novel.html
**GET /admin** → public/admin.html
**GET /settings** → public/settings.html
**GET /login** → public/login.html (no auth required)

---

## Lines 3188-3242: WebSocket Events

### Lines 3190-3194: Connection Event

**Event:** 'connection'
**Logic:** Log socket.id, set up event listeners

---

### Lines 3196-3208: Join User Room Event

**Event:** 'join_user_room'
**Payload:** { userId }
**Logic:** socket.join(`user_${userId}`)
**Use Case:** When user logs in, frontend calls this to join their room

---

### Lines 3210-3218: Disconnect Event

**Event:** 'disconnect'
**Logic:** Log socket.id, socket automatically leaves all rooms

---

### Lines 3220-3242: Progress Update Broadcast

**Called from:** POST /api/v1/progress (Lines 642-656)
**Logic:** io.to(`user_${userId}`).except(socketId).emit('progress_update', payload)
**Payload:** { novel_id, chapter_num, percent, device_label, latest_global, latest_per_device }
**Frontend:** Updates progress bars, shows notification

---

## Lines 3244-3285: Server Startup & Shutdown

### Lines 3246-3268: Server Initialization

**Logic:**

1. httpServer.listen(PORT)
2. Log: "Server running on port 3000"
3. Log: "Database connected"
4. Log: "WebSocket server initialized"

---

### Lines 3270-3285: Graceful Shutdown

**Signals:** SIGTERM, SIGINT (Ctrl+C)

**shutdown() Function:**

1. httpServer.close() - Stop accepting new connections
2. Wait for in-flight requests to complete
3. pool.end() - Close database connections
4. Wait for active queries to finish
5. Log: "Server closed successfully"
6. process.exit(0)

**Why Important:** Prevents incomplete transactions, allows current requests to finish, proper connection cleanup, required for zero-downtime deployments

---

## Architecture Summary

**Max-Progress Policy:** Forward-only tracking (new chapter > current OR same chapter AND new percent > current)

**Multi-Device Sync:** Per-device tracking + WebSocket broadcasts + getLatestStates() aggregation

**Auto-Add Features:** Progress endpoint auto-creates novels, auto-update endpoint from userscript metadata

**Session Management:** 30-day rolling sessions, httpOnly cookies, secure in production

**API Key Auth:** Stateless for userscript, X-API-Key header or ?key= query param

**Stale Device Cleanup:** Mark inactive >30 days as active=false, preserves historical data

**Error Handling:** Global process handlers, try-catch with 500 responses, validation returns 400, auth returns 401/403

---

**Total Lines:** 3,009
**API Endpoints:** 60+
**WebSocket Events:** 3 (connection, join_user_room, disconnect)
**Database Tables:** 10 with 8 indexes
**Authentication:** Dual system (session + API key)
