# ReadSync Documentation Index

Comprehensive line-by-line documentation of the ReadSync project.

## Documentation Structure

### Core Documentation
- **[SERVER.md](SERVER.md)** - Complete server.js line-by-line explanation (main file)
- **[DATABASE.md](DATABASE.md)** - Database schema, tables, and relationships
- **[API-ENDPOINTS.md](API-ENDPOINTS.md)** - All API endpoints with examples
- **[AUTHENTICATION.md](AUTHENTICATION.md)** - Auth system, sessions, and security
- **[WEBSOCKET.md](WEBSOCKET.md)** - Real-time communication via Socket.IO

### Supporting Files
- **[DB-UTILS.md](DB-UTILS.md)** - Database utility functions explained
- **[BOT.md](BOT.md)** - Chapter update bot system
- **[USERSCRIPT.md](USERSCRIPT.md)** - Browser userscript (tm-live.js)
- **[FRONTEND.md](FRONTEND.md)** - HTML pages and client-side JavaScript

## Quick Start Reading Path

If you're new to the codebase, read in this order:

1. **[AUTHENTICATION.md](AUTHENTICATION.md)** - Understand how login/sessions work
2. **[DATABASE.md](DATABASE.md)** - See the data structure
3. **[API-ENDPOINTS.md](API-ENDPOINTS.md)** - Learn what the API can do
4. **[SERVER.md](SERVER.md)** - Deep dive into the implementation

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     Browser (User)                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │  HTML Pages  │  │  Userscript  │  │  WebSocket   │     │
│  │  (login,     │  │  (tm-live.   │  │  Client      │     │
│  │  dashboard,  │  │   js)        │  │              │     │
│  │  mylist)     │  │              │  │              │     │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘     │
└─────────┼──────────────────┼──────────────────┼────────────┘
          │                  │                  │
          │ HTTPS            │ HTTPS            │ WebSocket
          │                  │                  │
┌─────────▼──────────────────▼──────────────────▼────────────┐
│                      Express Server                         │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              Middleware Layer                        │  │
│  │  • Session Management (express-session)              │  │
│  │  • CORS (cross-origin requests)                      │  │
│  │  • Body Parser (JSON)                                │  │
│  │  • Authentication (requireAuth, validateApiKey)      │  │
│  │  • Validation (express-validator)                    │  │
│  └─────────────────────┬────────────────────────────────┘  │
│                        │                                    │
│  ┌─────────────────────▼────────────────────────────────┐  │
│  │               API Routes                             │  │
│  │  • POST /api/auth/login                              │  │
│  │  • POST /api/auth/logout                             │  │
│  │  • POST /api/v1/progress                             │  │
│  │  • GET  /api/v1/novels                               │  │
│  │  • PUT  /api/v1/novels/:id/status                    │  │
│  │  • POST /api/v1/novels/:id/latest-chapter            │  │
│  │  • ... (30+ endpoints total)                         │  │
│  └─────────────────────┬────────────────────────────────┘  │
│                        │                                    │
│  ┌─────────────────────▼────────────────────────────────┐  │
│  │          Database Connection Pool (pg)               │  │
│  │  • 20 concurrent connections                         │  │
│  │  • Transaction support                               │  │
│  │  • Error handling                                    │  │
│  └─────────────────────┬────────────────────────────────┘  │
└────────────────────────┼───────────────────────────────────┘
                         │
                         │ PostgreSQL Protocol
                         │
┌────────────────────────▼───────────────────────────────────┐
│                  PostgreSQL Database                        │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Tables:                                             │  │
│  │  • users          (authentication)                   │  │
│  │  • devices        (multi-device sync)                │  │
│  │  • novels         (novel catalog)                    │  │
│  │  • user_novel_meta (reading list)                    │  │
│  │  • progress_snapshots (progress history)            │  │
│  │  • bookmarks      (saved positions)                  │  │
│  │  • notes          (user annotations)                 │  │
│  │  • novel_categories (organization)                   │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘

                    ┌─────────────────────┐
                    │  Chapter Update Bot │
                    │  (Puppeteer)        │
                    │  • Scrapes novels   │
                    │  • Updates chapters │
                    │  • Runs periodically│
                    └─────────────────────┘
```

## Key Technologies

- **Backend:** Node.js + Express.js
- **Database:** PostgreSQL with pg driver
- **Authentication:** bcryptjs + express-session
- **Real-time:** Socket.IO (WebSocket)
- **Validation:** express-validator
- **Web Scraping:** Puppeteer + chrome-aws-lambda
- **Browser Extension:** Tampermonkey userscript

## Environment Variables

```bash
# Required
DATABASE_URL=postgresql://user:pass@host:5432/dbname

# Authentication
ADMIN_USERNAME=admin
ADMIN_PASSWORD_HASH=<bcrypt hash>
SESSION_SECRET=<random secret>

# Optional
PORT=3000
NODE_ENV=production
ALLOWED_ORIGINS=https://example.com
PG_POOL_MAX=20
PG_IDLE_TIMEOUT=30000
```

## Database Schema Diagram

```
users
├── id (PK)
├── display_name
├── api_key (UNIQUE)
└── created_at

devices
├── id (PK)
├── user_id (FK → users.id)
├── device_label
├── device_type
├── last_seen
└── active

novels
├── id (PK)
├── title
├── author
├── genre
├── primary_url
├── latest_chapter_num
└── latest_chapter_title

user_novel_meta
├── user_id (PK, FK → users.id)
├── novel_id (PK, FK → novels.id)
├── status (reading/completed/dropped)
├── last_read_chapter
└── last_read_at

progress_snapshots
├── id (PK)
├── user_id (FK → users.id)
├── device_id (FK → devices.id)
├── novel_id (FK → novels.id)
├── chapter_num
├── percent
├── seconds_on_page
└── created_at

bookmarks
├── id (PK)
├── user_id (FK → users.id)
├── novel_id (FK → novels.id)
├── chapter_num
└── note

notes
├── id (PK)
├── user_id (FK → users.id)
├── novel_id (FK → novels.id)
├── chapter_num
└── text

novel_categories
├── user_id (PK, FK → users.id)
├── novel_id (PK, FK → novels.id)
└── category
```

## Next Steps

Continue reading the detailed documentation files to understand each component in depth.

Start with [AUTHENTICATION.md](AUTHENTICATION.md) to see how the login system works!
