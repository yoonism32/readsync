// server.js - Enhanced ReadSync API Server
// 🛡️ CRITICAL: Prevent crashes from unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
    console.error('🔴 UNHANDLED REJECTION:', reason);
    console.error('Promise:', promise);
});

process.on('uncaughtException', (error) => {
    console.error('🔴 UNCAUGHT EXCEPTION:', error);
    console.error('Stack:', error.stack);
});

const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');
const { URL } = require('url');
// const rateLimit = require('express-rate-limit');
const { body, param, query, validationResult } = require('express-validator');
const { createServer } = require('http');
const { Server } = require('socket.io');
const { createPool, forceNoVerify } = require('./db-utils');

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: process.env.ALLOWED_ORIGINS
            ? process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim())
            : ['https://readsync-n7zp.onrender.com', 'http://localhost:3000'],
        methods: ['GET', 'POST'],
        credentials: true
    }
});

const PORT = process.env.PORT || 3000;

// Export database utilities before requiring bot (to avoid circular dependency)
// These will be available when bot requires this file
let bot;
if (require.main === module) {
    // Only require bot when server.js is run directly, not when required as module
    bot = require('./chapter-update-bot-enhanced');
}

// /* ---------------------- Rate Limiting ---------------------- */
// // General API rate limiter: 100 requests per 15 minutes per IP
// const apiLimiter = rateLimit({
//     windowMs: 15 * 60 * 1000, // 15 minutes
//     max: 100, // limit each IP to 100 requests per windowMs
//     message: 'Too many requests from this IP, please try again later.',
//     standardHeaders: true,
//     legacyHeaders: false,
// });

// // Stricter rate limiter for auth endpoints: 20 requests per 15 minutes
// const authLimiter = rateLimit({
//     windowMs: 15 * 60 * 1000,
//     max: 20,
//     message: 'Too many authentication attempts, please try again later.',
//     standardHeaders: true,
//     legacyHeaders: false,
// });

/* ---------------------- Proxy Configuration ---------------------- */
// Enable trust proxy for accurate client IP detection behind Render's proxy
app.set('trust proxy', 1);

/* ---------------------- CORS Configuration ---------------------- */
// Simplified CORS for personal use - allows all origins
app.use(cors({
    origin: true, // Allow all origins
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

/* ---------------------- Middleware ---------------------- */
app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));

// Request logging middleware
app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        console.log(`${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`);
    });
    next();
});

/* ---------------------- Database Utilities ---------------------- */
/**
 * Create a PostgreSQL connection pool with standardized configuration
 * Note: createPool and forceNoVerify are now imported from db-utils.js
 */

/* ---------------------- Database Connection ---------------------- */
const raw = process.env.DATABASE_URL || '';
if (!raw) {
    console.error('DATABASE_URL environment variable is required');
    process.exit(1);
}

const pool = createPool({
    connectionString: raw,
    max: process.env.PG_POOL_MAX || 20,
    idleTimeoutMillis: process.env.PG_IDLE_TIMEOUT || 30000,
    connectionTimeoutMillis: process.env.PG_CONN_TIMEOUT || 10000,
});

/* ---------------------- Error Handling Utilities ---------------------- */
const handleDbError = (res, error, operation) => {
    console.error(`${operation} error:`, error);

    // Common PostgreSQL error codes
    switch (error.code) {
        case '23503': return res.status(400).json({ error: 'Referenced record not found' });
        case '23505': return res.status(409).json({ error: 'Duplicate entry' });
        case '23514': return res.status(400).json({ error: 'Check constraint violation' });
        case '42P01': return res.status(500).json({ error: 'Table does not exist' });
        default:
            return res.status(500).json({
                error: 'Database error',
                detail: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
            });
    }
};

const withTransaction = async (callback) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await callback(client);
        await client.query('COMMIT');
        return result;
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
};

/* ---------------------- Validation Middleware ---------------------- */
// Validation result handler
const handleValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            error: 'Validation failed',
            errors: errors.array()
        });
    }
    next();
};

const validateApiKey = async (req, res, next) => {
    const user_key = req.body?.user_key || req.query?.user_key;
    if (!user_key) {
        return res.status(401).json({ error: 'API key required' });
    }

    try {
        const result = await pool.query('SELECT id, display_name FROM users WHERE api_key = $1', [user_key]);
        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'Invalid API key' });
        }

        req.user = result.rows[0];
        next();
    } catch (error) {
        handleDbError(res, error, 'API key validation');
    }
};

const validateNovelId = (req, res, next) => {
    const { novelId } = req.params;
    if (!novelId || typeof novelId !== 'string' || novelId.length > 200) {
        return res.status(400).json({ error: 'Invalid novel ID format' });
    }
    next();
};

const validatePagination = (req, res, next) => {
    const limit = Math.max(1, Math.min(200, Number(req.query.limit || 50)));
    const offset = Math.max(0, Number(req.query.offset || 0));
    req.pagination = { limit, offset };
    next();
};

/* ---------------------- Database Schema Initialization ---------------------- */
async function initDatabase() {
    const client = await pool.connect();
    try {
        console.log('Initializing database schema...');

        // Enable UUID extension
        await client.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');

        // Users table
        await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        api_key TEXT UNIQUE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

        // Devices table - ensure active column is included
        await client.query(`
      CREATE TABLE IF NOT EXISTS devices (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        device_label TEXT NOT NULL,
        device_type TEXT DEFAULT 'unknown',
        user_agent TEXT,
        last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
      )
    `);

        // Novels catalog
        await client.query(`
      CREATE TABLE IF NOT EXISTS novels (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        primary_url TEXT,
        author TEXT,
        genre TEXT,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

        // 🔹 Add latest chapter columns (+ new time columns)
        await client.query(`
            ALTER TABLE novels ADD COLUMN IF NOT EXISTS latest_chapter_num INTEGER;
            ALTER TABLE novels ADD COLUMN IF NOT EXISTS latest_chapter_title TEXT;
            ALTER TABLE novels ADD COLUMN IF NOT EXISTS chapters_updated_at TIMESTAMP;
            ALTER TABLE novels ADD COLUMN IF NOT EXISTS site_latest_chapter_time_raw TEXT;
            ALTER TABLE novels ADD COLUMN IF NOT EXISTS site_latest_chapter_time TIMESTAMP;
        `);

        // Progress snapshots (time-series data)
        await client.query(`
      CREATE TABLE IF NOT EXISTS progress_snapshots (
        id BIGSERIAL PRIMARY KEY,
        user_id TEXT NOT NULL,
        device_id TEXT NOT NULL,
        novel_id TEXT NOT NULL,
        chapter_token TEXT,
        chapter_num INTEGER,
        chapter_slug_extra TEXT,
        percent NUMERIC(5,2) NOT NULL CHECK (percent >= 0 AND percent <= 100),
        url TEXT,
        seconds_on_page INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
        FOREIGN KEY (device_id) REFERENCES devices (id) ON DELETE CASCADE,
        FOREIGN KEY (novel_id) REFERENCES novels (id) ON DELETE CASCADE
      )
    `);

        // User novel metadata
        await client.query(`
      CREATE TABLE IF NOT EXISTS user_novel_meta (
        user_id TEXT NOT NULL,
        novel_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'reading' CHECK (status IN ('reading', 'completed', 'on-hold', 'dropped', 'removed')),
        favorite BOOLEAN DEFAULT FALSE,
        rating INTEGER CHECK (rating >= 1 AND rating <= 5),
        notes TEXT,
        started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, novel_id),
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
        FOREIGN KEY (novel_id) REFERENCES novels (id) ON DELETE CASCADE
      )
    `);

        // Bookmarks
        await client.query(`
      CREATE TABLE IF NOT EXISTS bookmarks (
        id BIGSERIAL PRIMARY KEY,
        user_id TEXT NOT NULL,
        novel_id TEXT NOT NULL,
        chapter_url TEXT NOT NULL,
        percent NUMERIC(5,2) NOT NULL CHECK (percent >= 0 AND percent <= 100),
        bookmark_type TEXT DEFAULT 'position' CHECK (bookmark_type IN ('position', 'highlight', 'note', 'favorite')),
        title TEXT,
        note TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
        FOREIGN KEY (novel_id) REFERENCES novels (id) ON DELETE CASCADE,
        UNIQUE (user_id, novel_id, chapter_url, percent)
      )
    `);

        // Reading sessions
        await client.query(`
      CREATE TABLE IF NOT EXISTS reading_sessions (
        id BIGSERIAL PRIMARY KEY,
        user_id TEXT NOT NULL,
        novel_id TEXT NOT NULL,
        device_id TEXT NOT NULL,
        session_type TEXT DEFAULT 'manual' CHECK (session_type IN ('auto', 'manual', 'imported')),
        start_time TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        end_time TIMESTAMP,
        start_percent NUMERIC(5,2) CHECK (start_percent >= 0 AND start_percent <= 100),
        end_percent NUMERIC(5,2) CHECK (end_percent >= 0 AND end_percent <= 100),
        time_spent_seconds INTEGER DEFAULT 0 CHECK (time_spent_seconds >= 0),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
        FOREIGN KEY (novel_id) REFERENCES novels (id) ON DELETE CASCADE,
        FOREIGN KEY (device_id) REFERENCES devices (id) ON DELETE CASCADE
      )
    `);

        // Now create indexes AFTER all tables exist with their columns
        console.log('Creating performance indexes...');

        const indexes = [
            'CREATE INDEX IF NOT EXISTS idx_progress_user_novel ON progress_snapshots (user_id, novel_id, created_at DESC)',
            'CREATE INDEX IF NOT EXISTS idx_progress_device ON progress_snapshots (device_id, novel_id, created_at DESC)',
            'CREATE INDEX IF NOT EXISTS idx_progress_created_at ON progress_snapshots (created_at DESC)',
            'CREATE INDEX IF NOT EXISTS idx_bookmarks_user_novel ON bookmarks (user_id, novel_id, created_at DESC)',
            'CREATE INDEX IF NOT EXISTS idx_sessions_user ON reading_sessions (user_id, start_time DESC)',
            'CREATE INDEX IF NOT EXISTS idx_sessions_novel ON reading_sessions (novel_id, start_time DESC)',
            'CREATE INDEX IF NOT EXISTS idx_devices_user_active ON devices (user_id, active, last_seen DESC)',
            'CREATE INDEX IF NOT EXISTS idx_user_novel_meta_status ON user_novel_meta (user_id, status, updated_at DESC)',
        ];

        for (const indexQuery of indexes) {
            try {
                await client.query(indexQuery);
                console.log(`✓ Index created: ${indexQuery.match(/idx_\w+/)[0]}`);
            } catch (indexError) {
                console.log(`⚠ Index might already exist or had issue: ${indexQuery.match(/idx_\w+/)[0]}`, indexError.message);
                // Continue with other indexes even if one fails
            }
        }

        // Insert demo user
        await client.query(`
      INSERT INTO users (id, display_name, api_key)
      VALUES ('demo-user', 'Demo User', 'demo-api-key-12345')
      ON CONFLICT (id) DO UPDATE SET
        display_name = EXCLUDED.display_name,
        api_key = EXCLUDED.api_key
    `);

        console.log('✅ Database schema initialized successfully');
    } catch (error) {
        console.error('Database initialization failed:', error);
        throw error;
    } finally {
        client.release();
    }
}

/* ---------------------- Utility Functions ---------------------- */

/**
 * Detect device type from User-Agent string
 * @param {string} userAgent - User-Agent header value
 * @returns {string} Device type: 'mobile' or 'desktop'
 */
function detectDeviceType(userAgent) {
    if (!userAgent) return 'desktop';

    const ua = userAgent.toLowerCase();
    if (/ipad|iphone|ipod|android/.test(ua)) {
        return 'mobile';
    }
    return 'desktop';
}

function normalizeNovelId(url) {
    const match = url.match(/\/b\/([^/]+)/);
    return match ? `novelbin:${match[1].toLowerCase()}` : null;
}

function extractNovelTitle(url) {
    const match = url.match(/\/b\/([^/]+)/);
    if (!match) return 'Unknown Novel';
    return match[1].replace(/-/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
}

function parseChapterFromUrl(url) {
    const m = url.match(/\/(c*chapter)-(\d+)(?:-\d+)?/i);
    if (!m) return null;
    return { token: m[1], num: parseInt(m[2], 10) };
}

async function getLatestStates(client, userId, novelId) {
    // Get global latest state across all devices
    const globalResult = await client.query(`
    SELECT p.*, d.device_label, d.last_seen AS device_last_seen
    FROM progress_snapshots p
    JOIN devices d ON p.device_id = d.id
    WHERE p.user_id = $1 AND p.novel_id = $2 AND d.active = TRUE
    ORDER BY p.chapter_num DESC, p.percent DESC, p.created_at DESC
    LIMIT 1
  `, [userId, novelId]);

    // Get latest state per device
    const deviceResult = await client.query(`
    SELECT DISTINCT ON (p.device_id) p.*, d.device_label
    FROM progress_snapshots p
    JOIN devices d ON p.device_id = d.id
    WHERE p.user_id = $1 AND p.novel_id = $2 AND d.active = TRUE
    ORDER BY p.device_id, p.created_at DESC
  `, [userId, novelId]);

    const latest_global = globalResult.rows.length > 0 ? {
        chapter_num: globalResult.rows[0].chapter_num,
        chapter_token: globalResult.rows[0].chapter_token,
        percent: parseFloat(globalResult.rows[0].percent),
        device_id: globalResult.rows[0].device_id,
        device_label: globalResult.rows[0].device_label,
        url: globalResult.rows[0].url,
        ts: globalResult.rows[0].created_at,
    } : null;

    let latest_per_device = {};
    deviceResult.rows.forEach((row) => {
        latest_per_device[row.device_id] = {
            chapter_num: row.chapter_num,
            chapter_token: row.chapter_token,
            percent: parseFloat(row.percent),
            device_label: row.device_label,
            url: row.url,
            ts: row.created_at,
        };
    });
    // Clean up device states that are too far behind
    if (latest_global) {
        const cleaned = {};

        const globalChapter = Number(latest_global.chapter_num) || 0;
        const globalPercent = Number(latest_global.percent) || 0;
        const leaderId = latest_global.device_id;

        for (const [id, d] of Object.entries(latest_per_device)) {
            const devChapter = Number(d.chapter_num) || 0;
            const devPercent = Number(d.percent) || 0;

            // Always keep the device that produced the global latest snapshot
            if (id === leaderId) {
                cleaned[id] = d;
                continue;
            }

            // If device is in a *much earlier* chapter → drop
            if (devChapter < globalChapter) continue;

            // Same chapter but very far behind (e.g. 45% vs 100%) → drop
            if (devChapter === globalChapter && devPercent < globalPercent - 20) continue;

            // Otherwise keep
            cleaned[id] = d;
        }

        latest_per_device = cleaned;
    }

    return { latest_global, latest_per_device };
}

/* ---------------------- Health Check Routes ---------------------- */
app.get('/health', async (req, res) => {
    try {
        const start = Date.now();
        await pool.query('SELECT 1');
        const dbLatency = Date.now() - start;

        res.json({
            status: 'healthy',
            timestamp: new Date().toISOString(),
            database: { connected: true, latency: `${dbLatency}ms` },
            uptime: process.uptime(),
            memory: process.memoryUsage()
        });
    } catch (error) {
        res.status(503).json({
            status: 'unhealthy',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

app.get('/healthz', async (req, res) => {
    try {
        await pool.query('SELECT 1');
        res.status(200).json({ ok: true });
    } catch (error) {
        res.status(503).json({ ok: false, error: error.message });
    }
});

/* ---------------------- Authentication Routes ---------------------- */
app.get('/api/v1/auth/whoami', /* authLimiter, */ validateApiKey, (req, res) => {
    res.json({
        id: req.user.id,
        display_name: req.user.display_name,
        authenticated: true
    });
});

/* ---------------------- Core Progress API ---------------------- */
// Apply rate limiting to all API routes
// app.use('/api/v1/', apiLimiter);

app.post('/api/v1/progress',
    [
        body('device_id').isString().isLength({ min: 1, max: 200 }).withMessage('device_id must be a string between 1-200 characters'),
        body('device_label').isString().isLength({ min: 1, max: 200 }).withMessage('device_label must be a string between 1-200 characters'),
        body('novel_url').isURL().withMessage('novel_url must be a valid URL'),
        body('percent').isFloat({ min: 0, max: 100 }).withMessage('percent must be a number between 0 and 100'),
        body('seconds_on_page').optional().isInt({ min: 0 }).withMessage('seconds_on_page must be a non-negative integer'),
        handleValidationErrors
    ],
    validateApiKey,
    async (req, res) => {
        const { device_id, device_label, novel_url, percent, seconds_on_page = 0 } = req.body;

        const user_id = req.user.id;
        const novel_id = normalizeNovelId(novel_url);
        const novel_title = extractNovelTitle(novel_url);

        // 🔹 FIXED: Use current_chapter_num from userscript if available, fallback to URL parsing
        const chapterInfo = req.body.current_chapter_num ?
            { token: 'chapter', num: req.body.current_chapter_num } :
            parseChapterFromUrl(novel_url);

        // Log chapter detection for debugging
        console.log('📊 Chapter detection:', {
            current_chapter_num: req.body.current_chapter_num,
            current_chapter_source: req.body.current_chapter_source,
            url_parsed: parseChapterFromUrl(novel_url),
            final_chapter: chapterInfo?.num
        });

        if (!novel_id || !chapterInfo) {
            return res.status(400).json({ error: 'Invalid novel URL format or missing chapter info' });
        }

        const percentValue = Math.max(0, Math.min(100, Number(percent)));
        const latestChapterNum = req.body.latest_chapter_num != null ? Number(req.body.latest_chapter_num) : null;
        const latestChapterTitle = req.body.latest_chapter_title || null;

        try {
            const result = await withTransaction(async (client) => {
                // Upsert device with type detection - FIXED to prevent duplicates
                const deviceType = detectDeviceType(req.get('User-Agent'));

                await client.query(`
        INSERT INTO devices (id, user_id, device_label, device_type, user_agent, last_seen, active)
        VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, TRUE)
        ON CONFLICT (id) DO UPDATE SET
          device_label = EXCLUDED.device_label,
          device_type = EXCLUDED.device_type,
          user_agent = EXCLUDED.user_agent,
          last_seen = CURRENT_TIMESTAMP,
          active = TRUE
      `, [device_id, user_id, device_label, deviceType, req.get('User-Agent') || '']);

                // 🔹 Upsert novel with latest chapter info
                // Simplified: Use GREATEST to only update if new chapter is higher
                await client.query(`
        INSERT INTO novels (id, title, primary_url, latest_chapter_num, latest_chapter_title, chapters_updated_at)
        VALUES ($1, $2, $3, $4::integer, $5, CASE WHEN $4::integer IS NOT NULL THEN CURRENT_TIMESTAMP ELSE NULL END)
        ON CONFLICT (id) DO UPDATE SET
            title = EXCLUDED.title,
            primary_url = EXCLUDED.primary_url,
            latest_chapter_num = GREATEST(
                COALESCE(novels.latest_chapter_num, 0),
                COALESCE(EXCLUDED.latest_chapter_num::integer, 0)
            ),
            latest_chapter_title = CASE 
                WHEN EXCLUDED.latest_chapter_num::integer > COALESCE(novels.latest_chapter_num, 0)
                THEN EXCLUDED.latest_chapter_title 
                ELSE novels.latest_chapter_title 
            END,
            chapters_updated_at = CASE 
                WHEN EXCLUDED.latest_chapter_num::integer > COALESCE(novels.latest_chapter_num, 0)
                THEN CURRENT_TIMESTAMP 
                ELSE novels.chapters_updated_at 
            END
        `, [novel_id, novel_title, novel_url, latestChapterNum, latestChapterTitle]);
                // Ensure user novel metadata exists
                await client.query(`
        INSERT INTO user_novel_meta (user_id, novel_id, started_at)
        VALUES ($1, $2, CURRENT_TIMESTAMP)
        ON CONFLICT (user_id, novel_id) DO NOTHING
      `, [user_id, novel_id]);

                // Check if we should update (max-progress policy)
                const lastProgress = await client.query(`
        SELECT percent, chapter_num, created_at
        FROM progress_snapshots
        WHERE user_id = $1 AND device_id = $2 AND novel_id = $3
        ORDER BY created_at DESC
        LIMIT 1
      `, [user_id, device_id, novel_id]);

                let shouldUpdate = true;
                if (lastProgress.rows.length > 0) {
                    const prev = lastProgress.rows[0];
                    // Don't update if going backwards in same chapter
                    if (prev.chapter_num === chapterInfo.num && percentValue <= parseFloat(prev.percent)) {
                        shouldUpdate = false;
                    }
                    // Don't update if going to earlier chapter
                    if (chapterInfo.num < prev.chapter_num) {
                        shouldUpdate = false;
                    }
                    // Ignore noise at chapter start if previously made progress
                    if (percentValue <= 1 && parseFloat(prev.percent) > 10 && prev.chapter_num === chapterInfo.num) {
                        shouldUpdate = false;
                    }
                }

                if (shouldUpdate) {
                    await client.query(`
          INSERT INTO progress_snapshots
            (user_id, device_id, novel_id, chapter_token, chapter_num, percent, url, seconds_on_page)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `, [user_id, device_id, novel_id, chapterInfo.token, chapterInfo.num, percentValue, novel_url, seconds_on_page]);
                }

                return await getLatestStates(client, user_id, novel_id);
            });

            const response = {
                status: 'success',
                updated: true,
                novel_id,
                ...result
            };

            // Emit WebSocket event to user's room for real-time sync
            try {
                io.to(`user:${user_id}`).emit('progress:updated', {
                    novel_id,
                    ...result,
                    timestamp: new Date().toISOString()
                });
            } catch (wsError) {
                // Don't fail the request if WebSocket fails
                console.error('WebSocket emit error:', wsError);
            }

            res.json(response);

        } catch (error) {
            handleDbError(res, error, 'Progress update');
        }
    });

app.get('/api/v1/progress', validateApiKey, async (req, res) => {
    const { novel_id } = req.query;

    if (!novel_id) {
        return res.status(400).json({ error: 'novel_id parameter required' });
    }

    try {
        const client = await pool.connect();
        try {
            const states = await getLatestStates(client, req.user.id, novel_id);
            res.json(states);
        } finally {
            client.release();
        }
    } catch (error) {
        handleDbError(res, error, 'Get progress');
    }
});

app.get('/api/v1/compare', validateApiKey, async (req, res) => {
    const { novel_id, device_id } = req.query;

    if (!novel_id || !device_id) {
        return res.status(400).json({ error: 'novel_id and device_id parameters required' });
    }

    try {
        const client = await pool.connect();
        try {
            const states = await getLatestStates(client, req.user.id, novel_id);
            const deviceState = states.latest_per_device[device_id];
            const globalState = states.latest_global;

            if (!deviceState || !globalState) {
                return res.json({
                    device_state: deviceState || null,
                    global_state: globalState || null,
                    should_prompt_jump: false,
                });
            }

            const chapterDiff = globalState.chapter_num - deviceState.chapter_num;
            const percentDiff = globalState.percent - deviceState.percent;

            let shouldPrompt = false;
            if (chapterDiff > 0) shouldPrompt = true;
            else if (chapterDiff === 0 && percentDiff >= 5.0) shouldPrompt = true;

            // Don't prompt if this device is the most advanced
            if (globalState.device_id === device_id) shouldPrompt = false;

            res.json({
                device_state: deviceState,
                global_state: globalState,
                delta: { chapters_ahead: chapterDiff, percent_diff: percentDiff },
                should_prompt_jump: shouldPrompt,
            });
        } finally {
            client.release();
        }
    } catch (error) {
        handleDbError(res, error, 'Compare progress');
    }
});

/* ---------------------- Novel Management ---------------------- */
app.get('/api/v1/novels', validateApiKey, validatePagination, async (req, res) => {
    const { include_removed, status, favorite } = req.query;
    const { limit, offset } = req.pagination;

    try {
        const client = await pool.connect();
        try {
            let params = [req.user.id];
            let paramIndex = 1;

            const whereConditions = [];
            if (include_removed !== 'true') {
                whereConditions.push(`COALESCE(m.status, 'reading') <> 'removed'`);
            }
            if (status) {
                whereConditions.push(`COALESCE(m.status, 'reading') = $${++paramIndex}`);
                params.push(status);
            }
            if (favorite === 'true') {
                whereConditions.push(`m.favorite = TRUE`);
            }

            const whereClause = whereConditions.length ? `AND ${whereConditions.join(' AND ')}` : '';

            // 🚀 OPTIMIZED: Single query with LATERAL join instead of N+1 queries
            const novelsQuery = `
                WITH latest_activity AS (
                    SELECT DISTINCT ON (novel_id) 
                        novel_id, 
                        created_at as last_activity
                    FROM progress_snapshots
                    WHERE user_id = $1
                    ORDER BY novel_id, created_at DESC
                )
                SELECT
                    n.id,
                    n.title,
                    n.primary_url,
                    n.author,
                    n.genre,
                    n.latest_chapter_num,
                    n.latest_chapter_title,
                    n.chapters_updated_at,
                    n.site_latest_chapter_time_raw,
                    n.site_latest_chapter_time,
                    la.last_activity,
                    COALESCE(m.status, 'reading') AS status,
                    COALESCE(m.favorite, FALSE) AS favorite,
                    COALESCE(m.rating, 0) AS rating,
                    m.notes,
                    m.started_at,
                    m.completed_at,
                    -- Get global latest state
                    (SELECT row_to_json(global_latest) FROM (
                        SELECT 
                            p.chapter_num,
                            p.chapter_token,
                            p.percent,
                            p.device_id,
                            d.device_label,
                            p.url,
                            p.created_at as ts
                        FROM progress_snapshots p
                        JOIN devices d ON p.device_id = d.id
                        WHERE p.user_id = $1 
                          AND p.novel_id = n.id 
                          AND d.active = TRUE
                        ORDER BY p.chapter_num DESC, p.percent DESC, p.created_at DESC
                        LIMIT 1
                    ) global_latest) as latest_global_json,
                    -- Get per-device states
                    (SELECT json_object_agg(device_id, device_state) FROM (
                        SELECT DISTINCT ON (p.device_id)
                            p.device_id,
                            json_build_object(
                                'chapter_num', p.chapter_num,
                                'chapter_token', p.chapter_token,
                                'percent', p.percent,
                                'device_label', d.device_label,
                                'url', p.url,
                                'ts', p.created_at
                            ) as device_state
                        FROM progress_snapshots p
                        JOIN devices d ON p.device_id = d.id
                        WHERE p.user_id = $1 
                          AND p.novel_id = n.id 
                          AND d.active = TRUE
                        ORDER BY p.device_id, p.created_at DESC
                    ) per_device) as latest_per_device_json
                FROM novels n
                JOIN latest_activity la ON n.id = la.novel_id
                LEFT JOIN user_novel_meta m ON m.user_id = $1 AND m.novel_id = n.id
                WHERE 1=1 ${whereClause}
                ORDER BY la.last_activity DESC
                LIMIT $${++paramIndex} OFFSET $${++paramIndex}
            `;

            params.push(limit, offset);
            const novelsResult = await client.query(novelsQuery, params);

            // Transform results with device cleanup
            const results = novelsResult.rows.map(novel => {
                const latest_global = novel.latest_global_json || null;
                let latest_per_device = novel.latest_per_device_json || {};

                // 🚀 CLEANUP: Remove stale device states
                if (latest_global && latest_per_device && Object.keys(latest_per_device).length > 0) {
                    const cleaned = {};
                    const globalChapter = Number(latest_global.chapter_num) || 0;
                    const globalPercent = Number(latest_global.percent) || 0;
                    const leaderId = latest_global.device_id;

                    for (const [id, d] of Object.entries(latest_per_device)) {
                        const devChapter = Number(d.chapter_num) || 0;
                        const devPercent = Number(d.percent) || 0;

                        // Always keep the device that produced the global latest snapshot
                        if (id === leaderId) {
                            cleaned[id] = d;
                            continue;
                        }

                        // If device is in a *much earlier* chapter → drop
                        if (devChapter < globalChapter) continue;

                        // Same chapter but very far behind (e.g. 45% vs 100%) → drop
                        if (devChapter === globalChapter && devPercent < globalPercent - 20) continue;

                        // Otherwise keep
                        cleaned[id] = d;
                    }

                    latest_per_device = cleaned;
                }

                return {
                    novel_id: novel.id,
                    title: novel.title,
                    primary_url: novel.primary_url,
                    author: novel.author,
                    genre: novel.genre,
                    latest_chapter_num: novel.latest_chapter_num,
                    latest_chapter_title: novel.latest_chapter_title,
                    chapters_updated_at: novel.chapters_updated_at,
                    site_latest_chapter_time_raw: novel.site_latest_chapter_time_raw,
                    site_latest_chapter_time: novel.site_latest_chapter_time,
                    status: novel.status,
                    favorite: novel.favorite,
                    rating: novel.rating,
                    notes: novel.notes,
                    started_at: novel.started_at,
                    completed_at: novel.completed_at,
                    last_activity: novel.last_activity,
                    latest_global: latest_global,
                    latest_per_device: latest_per_device
                };
            });

            res.json(results);
        } finally {
            client.release();
        }
    } catch (error) {
        handleDbError(res, error, 'List novels');
    }
});

// 🔴 FIXED status endpoint
app.put('/api/v1/novels/:novelId/status',
    [
        param('novelId').isString().isLength({ min: 1, max: 200 }).withMessage('Invalid novel ID format'),
        body('status').isIn(['reading', 'completed', 'on-hold', 'dropped', 'removed']).withMessage('Invalid status'),
        handleValidationErrors
    ],
    validateApiKey,
    validateNovelId,
    async (req, res) => {
        const { novelId } = req.params;
        const { status } = req.body;

        try {
            const result = await withTransaction(async (client) => {
                // First ensure the novel exists in user_novel_meta
                await client.query(`
                INSERT INTO user_novel_meta (user_id, novel_id, status, updated_at)
                VALUES ($1, $2, 'reading', CURRENT_TIMESTAMP)
                ON CONFLICT (user_id, novel_id) DO NOTHING
            `, [req.user.id, novelId]);

                // Update the status
                const updateResult = await client.query(`
                UPDATE user_novel_meta SET
                    status = $3,
                    updated_at = CURRENT_TIMESTAMP,
                    completed_at = CASE 
                        WHEN $3 = 'completed' THEN COALESCE(completed_at, CURRENT_TIMESTAMP)
                        WHEN $3 != 'completed' THEN NULL
                        ELSE completed_at 
                    END
                WHERE user_id = $1 AND novel_id = $2
                RETURNING *
            `, [req.user.id, novelId, status]);

                if (updateResult.rows.length === 0) {
                    throw new Error('Novel not found for user');
                }

                // If marking as completed, create a 100% progress snapshot
                if (status === 'completed') {
                    // Get the latest progress to determine chapter info
                    const latestProgress = await client.query(`
                    SELECT chapter_num, chapter_token, url, novel_id
                    FROM progress_snapshots
                    WHERE user_id = $1 AND novel_id = $2
                    ORDER BY created_at DESC
                    LIMIT 1
                `, [req.user.id, novelId]);

                    if (latestProgress.rows.length > 0) {
                        const latest = latestProgress.rows[0];
                        await client.query(`
                        INSERT INTO progress_snapshots (
                            user_id, device_id, novel_id, chapter_token, 
                            chapter_num, percent, url, seconds_on_page
                        )
                        VALUES ($1, 'system', $2, $3, $4, 100, $5, 0)
                    `, [
                            req.user.id,
                            latest.novel_id,
                            latest.chapter_token,
                            latest.chapter_num,
                            latest.url
                        ]);
                    }
                }

                return updateResult.rows[0];
            });

            res.json({
                success: true,
                status: result.status,
                updated_at: result.updated_at
            });
        } catch (error) {
            handleDbError(res, error, 'Update novel status');
        }
    });

app.delete('/api/v1/novels/:novelId', validateApiKey, validateNovelId, async (req, res) => {
    const { novelId } = req.params;
    const { hard = false } = req.body;

    try {
        await withTransaction(async (client) => {
            if (hard) {
                // Hard delete: remove all associated data
                await client.query('DELETE FROM bookmarks WHERE user_id = $1 AND novel_id = $2', [req.user.id, novelId]);
                await client.query('DELETE FROM reading_sessions WHERE user_id = $1 AND novel_id = $2', [req.user.id, novelId]);
                await client.query('DELETE FROM progress_snapshots WHERE user_id = $1 AND novel_id = $2', [req.user.id, novelId]);
                await client.query('DELETE FROM user_novel_meta WHERE user_id = $1 AND novel_id = $2', [req.user.id, novelId]);
            } else {
                // Soft delete: mark as removed
                await client.query(`
          INSERT INTO user_novel_meta (user_id, novel_id, status, updated_at)
          VALUES ($1, $2, 'removed', CURRENT_TIMESTAMP)
          ON CONFLICT (user_id, novel_id) DO UPDATE SET
            status = 'removed',
            updated_at = CURRENT_TIMESTAMP
        `, [req.user.id, novelId]);
            }
        });

        res.json({
            success: true,
            removed: true,
            hard_delete: hard
        });
    } catch (error) {
        handleDbError(res, error, 'Delete novel');
    }
});

/* ---------------------- Additional Novel Endpoints ---------------------- */
app.post('/api/v1/novels/:novelId/favorite', validateApiKey, validateNovelId, async (req, res) => {
    const { novelId } = req.params;

    try {
        await pool.query(`
      INSERT INTO user_novel_meta (user_id, novel_id, favorite, updated_at)
      VALUES ($1, $2, TRUE, CURRENT_TIMESTAMP)
      ON CONFLICT (user_id, novel_id) DO UPDATE SET
        favorite = TRUE,
        updated_at = CURRENT_TIMESTAMP
    `, [req.user.id, novelId]);

        res.json({ success: true, favorited: true });
    } catch (error) {
        handleDbError(res, error, 'Favorite novel');
    }
});

app.delete('/api/v1/novels/:novelId/favorite', validateApiKey, validateNovelId, async (req, res) => {
    const { novelId } = req.params;

    try {
        await pool.query(`
      UPDATE user_novel_meta 
      SET favorite = FALSE, updated_at = CURRENT_TIMESTAMP
      WHERE user_id = $1 AND novel_id = $2
    `, [req.user.id, novelId]);

        res.json({ success: true, favorited: false });
    } catch (error) {
        handleDbError(res, error, 'Unfavorite novel');
    }
});

app.get('/api/v1/novels/completed', validateApiKey, validatePagination, async (req, res) => {
    const { limit, offset } = req.pagination;

    try {
        const result = await pool.query(`
      SELECT n.id, n.title, n.primary_url, n.author, n.genre,
             m.completed_at, m.rating, m.notes, m.favorite
      FROM user_novel_meta m
      JOIN novels n ON n.id = m.novel_id
      WHERE m.user_id = $1 AND m.status = 'completed'
      ORDER BY m.completed_at DESC
      LIMIT $2 OFFSET $3
    `, [req.user.id, limit, offset]);

        res.json({
            novels: result.rows,
            pagination: { limit, offset, total: result.rows.length }
        });
    } catch (error) {
        handleDbError(res, error, 'Get completed novels');
    }
});

app.get('/api/v1/novels/favorites', validateApiKey, validatePagination, async (req, res) => {
    const { limit, offset } = req.pagination;

    try {
        const result = await pool.query(`
      SELECT n.id, n.title, n.primary_url, n.author, n.genre,
             m.status, m.rating, m.notes, m.updated_at
      FROM user_novel_meta m
      JOIN novels n ON n.id = m.novel_id
      WHERE m.user_id = $1 AND m.favorite = TRUE AND m.status <> 'removed'
      ORDER BY m.updated_at DESC
      LIMIT $2 OFFSET $3
    `, [req.user.id, limit, offset]);

        res.json({
            novels: result.rows,
            pagination: { limit, offset, total: result.rows.length }
        });
    } catch (error) {
        handleDbError(res, error, 'Get favorite novels');
    }
});

app.put('/api/v1/novels/:novelId/notes', validateApiKey, validateNovelId, async (req, res) => {
    const { novelId } = req.params;
    const { notes } = req.body;

    try {
        await pool.query(`
      INSERT INTO user_novel_meta (user_id, novel_id, notes, updated_at)
      VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
      ON CONFLICT (user_id, novel_id) DO UPDATE SET
        notes = EXCLUDED.notes,
        updated_at = CURRENT_TIMESTAMP
    `, [req.user.id, novelId, notes || null]);

        res.json({ success: true });
    } catch (error) {
        handleDbError(res, error, 'Update novel notes');
    }
});

/* ---------------------- 🔹 ADMIN/BOT MANAGEMENT ROUTES 🔹 ---------------------- */

// Get novels that need chapter updates
app.get('/api/v1/admin/novels/stale', validateApiKey, async (req, res) => {
    const { hours = 24 } = req.query;
    const hoursValue = Math.max(1, Math.min(168, parseInt(hours, 10) || 24)); // Clamp between 1 and 168 hours

    try {
        const result = await pool.query(`
            SELECT 
                n.id,
                n.title,
                n.primary_url,
                n.latest_chapter_num,
                n.latest_chapter_title,
                n.chapters_updated_at,
                COUNT(DISTINCT p.user_id) as active_readers,
                MAX(p.created_at) as last_read_at
            FROM novels n
            LEFT JOIN progress_snapshots p ON p.novel_id = n.id
            WHERE 
                n.primary_url IS NOT NULL
                AND (
                    n.chapters_updated_at IS NULL 
                    OR n.chapters_updated_at < NOW() - make_interval(hours => $1)
                )
            GROUP BY n.id, n.title, n.primary_url, n.latest_chapter_num, 
                     n.latest_chapter_title, n.chapters_updated_at
            HAVING COUNT(DISTINCT p.user_id) > 0
            ORDER BY active_readers DESC, n.chapters_updated_at ASC NULLS FIRST
        `, [hoursValue]);

        res.json(result.rows);
    } catch (error) {
        handleDbError(res, error, 'Get stale novels');
    }
});

// Manually trigger update for a specific novel
app.post('/api/v1/admin/novels/:novelId/update', validateApiKey, validateNovelId, async (req, res) => {
    const { novelId } = req.params;

    try {
        if (bot.triggerManualUpdate) {
            const result = await bot.triggerManualUpdate(novelId);
            res.json(result);
        } else {
            res.status(503).json({
                error: 'Bot module not loaded',
                message: 'Chapter update bot is not running'
            });
        }
    } catch (error) {
        handleDbError(res, error, 'Manual novel update');
    }
});

// Get bot status
app.get('/api/v1/admin/bot/status', validateApiKey, async (req, res) => {
    try {
        const status = global.botStatus || {
            running: false,
            lastRun: null,
            lastRunSuccess: false,
            novelsUpdated: 0,
            novelsChecked: 0,
            nextRun: null,
            errors: []
        };

        res.json(status);
    } catch (error) {
        handleDbError(res, error, 'Get bot status');
    }
});

// Trigger manual bot run
app.post('/api/v1/admin/bot/trigger', validateApiKey, async (req, res) => {
    try {
        if (bot.updateNovelChapters) {
            setImmediate(() => bot.updateNovelChapters());
            res.json({
                success: true,
                message: 'Bot update cycle triggered'
            });
        } else {
            res.status(503).json({
                error: 'Bot not available',
                message: 'Chapter update bot is not running'
            });
        }
    } catch (error) {
        handleDbError(res, error, 'Trigger bot update');
    }
});

// ==================== FORCE UPDATE ALL ====================
app.post('/admin/force-refresh-all', async (req, res) => {
    try {
        await pool.query(`UPDATE novels SET chapters_updated_at = NULL`);

        // ✅ CORRECT - use bot.updateNovelChapters()
        if (bot.updateNovelChapters) {
            setImmediate(() => bot.updateNovelChapters());
        }

        return res.json({ success: true, message: "Global refresh started." });
    } catch (err) {
        console.error("Force refresh failed:", err);
        return res.status(500).json({ error: err.message });
    }
});

// New endpoint to track update progress
app.get('/api/v1/admin/bot/progress', validateApiKey, async (req, res) => {
    try {
        const status = global.botStatus || {
            running: false,
            novelsChecked: 0,
            novelsUpdated: 0,
        };

        // 🚀 FIXED: Use DISTINCT to prevent query explosion
        const result = await pool.query(`
            SELECT COUNT(DISTINCT n.id) as count
            FROM novels n
            WHERE n.primary_url IS NOT NULL
              AND EXISTS (
                SELECT 1 FROM progress_snapshots p 
                WHERE p.novel_id = n.id 
                LIMIT 1
              )
              AND (
                n.chapters_updated_at IS NULL 
                OR n.chapters_updated_at < NOW() - INTERVAL '24 hours'
              )
        `);

        res.json({
            ...status,
            remainingNovels: parseInt(result.rows[0].count)
        });
    } catch (error) {
        handleDbError(res, error, 'Get bot progress');
    }
});

/* ---------------------- Bookmarks API ---------------------- */
app.get('/api/v1/bookmarks/:novelId', validateApiKey, validateNovelId, async (req, res) => {
    const { novelId } = req.params;

    try {
        const result = await pool.query(`
      SELECT id, chapter_url, percent, bookmark_type, title, note, created_at
      FROM bookmarks
      WHERE user_id = $1 AND novel_id = $2
      ORDER BY created_at DESC
    `, [req.user.id, novelId]);

        res.json(result.rows);
    } catch (error) {
        handleDbError(res, error, 'Get novel bookmarks');
    }
});

app.get('/api/v1/bookmarks', validateApiKey, validatePagination, async (req, res) => {
    const { limit, offset } = req.pagination;
    const { bookmark_type } = req.query;

    try {
        let query = `
      SELECT b.id, b.novel_id, n.title, b.chapter_url, b.percent, 
             b.bookmark_type, b.title AS bookmark_title, b.note, b.created_at
      FROM bookmarks b
      JOIN novels n ON n.id = b.novel_id
      WHERE b.user_id = $1
    `;
        const params = [req.user.id];

        if (bookmark_type) {
            query += ` AND b.bookmark_type = $${params.length + 1}`;
            params.push(bookmark_type);
        }

        query += ` ORDER BY b.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
        params.push(limit, offset);

        const result = await pool.query(query, params);

        res.json({
            bookmarks: result.rows,
            pagination: { limit, offset, total: result.rows.length }
        });
    } catch (error) {
        handleDbError(res, error, 'Get bookmarks');
    }
});

app.post('/api/v1/bookmarks',
    [
        body('novel_id').isString().isLength({ min: 1, max: 200 }).withMessage('novel_id must be a string between 1-200 characters'),
        body('chapter_url').isURL().withMessage('chapter_url must be a valid URL'),
        body('percent').isFloat({ min: 0, max: 100 }).withMessage('percent must be a number between 0 and 100'),
        body('bookmark_type').optional().isIn(['position', 'highlight', 'note', 'favorite']).withMessage('Invalid bookmark_type'),
        body('title').optional().isString().isLength({ max: 500 }).withMessage('title must be a string up to 500 characters'),
        body('note').optional().isString().isLength({ max: 5000 }).withMessage('note must be a string up to 5000 characters'),
        handleValidationErrors
    ],
    validateApiKey,
    async (req, res) => {
        const { novel_id, chapter_url, percent, bookmark_type = 'position', title, note } = req.body;

        const percentValue = Math.max(0, Math.min(100, Number(percent)));

        try {
            const result = await withTransaction(async (client) => {
                // Ensure novel exists
                await client.query(`
        INSERT INTO novels (id, title, primary_url)
        VALUES ($1, $2, $3)
        ON CONFLICT (id) DO NOTHING
      `, [novel_id, extractNovelTitle(chapter_url), chapter_url]);

                // Create bookmark
                const insertResult = await client.query(`
        INSERT INTO bookmarks (user_id, novel_id, chapter_url, percent, bookmark_type, title, note)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id, created_at
      `, [req.user.id, novel_id, chapter_url, percentValue, bookmark_type, title || null, note || null]);

                return insertResult.rows[0];
            });

            res.status(201).json({
                success: true,
                id: result.id,
                created_at: result.created_at
            });
        } catch (error) {
            if (error.code === '23505') {
                return res.status(409).json({ error: 'Bookmark already exists at this position' });
            }
            handleDbError(res, error, 'Create bookmark');
        }
    });

app.put('/api/v1/bookmarks/:bookmarkId', validateApiKey, async (req, res) => {
    const { bookmarkId } = req.params;
    const { percent, bookmark_type, title, note } = req.body;

    const validTypes = ['position', 'highlight', 'note', 'favorite'];
    if (bookmark_type && !validTypes.includes(bookmark_type)) {
        return res.status(400).json({
            error: 'Invalid bookmark_type',
            allowed: validTypes
        });
    }

    try {
        const updates = [];
        const params = [req.user.id];
        let paramIndex = 1;

        if (percent != null) {
            updates.push(`percent = $${++paramIndex}`);
            params.push(Math.max(0, Math.min(100, Number(percent))));
        }
        if (bookmark_type) {
            updates.push(`bookmark_type = $${++paramIndex}`);
            params.push(bookmark_type);
        }
        if (title !== undefined) {
            updates.push(`title = $${++paramIndex}`);
            params.push(title);
        }
        if (note !== undefined) {
            updates.push(`note = $${++paramIndex}`);
            params.push(note);
        }

        if (updates.length === 0) {
            return res.json({ success: true, message: 'No changes provided' });
        }

        params.push(Number(bookmarkId));

        const result = await pool.query(`
      UPDATE bookmarks
      SET ${updates.join(', ')}
      WHERE user_id = $1 AND id = $${params.length}
      RETURNING id
    `, params);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Bookmark not found' });
        }

        res.json({ success: true });
    } catch (error) {
        handleDbError(res, error, 'Update bookmark');
    }
});

app.delete('/api/v1/bookmarks/:bookmarkId', validateApiKey, async (req, res) => {
    const { bookmarkId } = req.params;

    try {
        const result = await pool.query(`
      DELETE FROM bookmarks 
      WHERE user_id = $1 AND id = $2
      RETURNING id
    `, [req.user.id, Number(bookmarkId)]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Bookmark not found' });
        }

        res.json({ success: true });
    } catch (error) {
        handleDbError(res, error, 'Delete bookmark');
    }
});

/* ---------------------- Reading Sessions API ---------------------- */
app.get('/api/v1/sessions', validateApiKey, validatePagination, async (req, res) => {
    const { limit, offset } = req.pagination;
    const { novel_id, device_id } = req.query;

    try {
        let query = `
      SELECT s.id, s.novel_id, n.title, s.device_id, d.device_label, s.session_type,
             s.start_time, s.end_time, s.start_percent, s.end_percent, s.time_spent_seconds
      FROM reading_sessions s
      JOIN novels n ON n.id = s.novel_id
      JOIN devices d ON d.id = s.device_id
      WHERE s.user_id = $1
    `;
        const params = [req.user.id];

        if (novel_id) {
            query += ` AND s.novel_id = $${params.length + 1}`;
            params.push(novel_id);
        }
        if (device_id) {
            query += ` AND s.device_id = $${params.length + 1}`;
            params.push(device_id);
        }

        query += ` ORDER BY s.start_time DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
        params.push(limit, offset);


        const result = await pool.query(query, params);

        res.json({
            sessions: result.rows,
            pagination: { limit, offset, total: result.rows.length }
        });
    } catch (error) {
        handleDbError(res, error, 'Get reading sessions');
    }
});

app.get('/api/v1/sessions/:novelId', validateApiKey, validateNovelId, async (req, res) => {
    const { novelId } = req.params;

    try {
        const result = await pool.query(`
      SELECT s.id, s.device_id, d.device_label, s.session_type,
             s.start_time, s.end_time, s.start_percent, s.end_percent, s.time_spent_seconds
      FROM reading_sessions s
      JOIN devices d ON d.id = s.device_id
      WHERE s.user_id = $1 AND s.novel_id = $2
      ORDER BY s.start_time DESC
    `, [req.user.id, novelId]);

        res.json(result.rows);
    } catch (error) {
        handleDbError(res, error, 'Get novel sessions');
    }
});

app.get('/api/v1/sessions/active', validateApiKey, async (req, res) => {
    try {
        const result = await pool.query(`
      SELECT s.id, s.novel_id, n.title, s.device_id, d.device_label,
             s.start_time, s.start_percent,
             EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - s.start_time))::int AS duration_seconds
      FROM reading_sessions s
      JOIN novels n ON n.id = s.novel_id
      JOIN devices d ON d.id = s.device_id
      WHERE s.user_id = $1 AND s.end_time IS NULL
      ORDER BY s.start_time DESC
    `, [req.user.id]);

        res.json(result.rows);
    } catch (error) {
        handleDbError(res, error, 'Get active sessions');
    }
});

app.post('/api/v1/sessions', validateApiKey, async (req, res) => {
    const { novel_id, device_id, session_type = 'manual', start_time, start_percent } = req.body;

    if (!novel_id || !device_id) {
        return res.status(400).json({
            error: 'Missing required fields: novel_id, device_id'
        });
    }

    const validTypes = ['auto', 'manual', 'imported'];
    if (!validTypes.includes(session_type)) {
        return res.status(400).json({
            error: 'Invalid session_type',
            allowed: validTypes
        });
    }

    try {
        const result = await pool.query(`
      INSERT INTO reading_sessions (user_id, novel_id, device_id, session_type, start_time, start_percent)
      VALUES ($1, $2, $3, $4, COALESCE($5::timestamp, CURRENT_TIMESTAMP), $6)
      RETURNING id, start_time
    `, [
            req.user.id,
            novel_id,
            device_id,
            session_type,
            start_time || null,
            start_percent != null ? Number(start_percent) : null
        ]);

        res.status(201).json({
            success: true,
            id: result.rows[0].id,
            start_time: result.rows[0].start_time
        });
    } catch (error) {
        handleDbError(res, error, 'Start reading session');
    }
});

app.put('/api/v1/sessions/:sessionId/end', validateApiKey, async (req, res) => {
    const { sessionId } = req.params;
    const { end_time, end_percent, time_spent_seconds } = req.body;

    try {
        const sessionResult = await pool.query(`
      SELECT start_time FROM reading_sessions 
      WHERE id = $1 AND user_id = $2 AND end_time IS NULL
    `, [Number(sessionId), req.user.id]);

        if (sessionResult.rows.length === 0) {
            return res.status(404).json({ error: 'Active session not found' });
        }

        const startTime = new Date(sessionResult.rows[0].start_time);
        const endTime = end_time ? new Date(end_time) : new Date();
        const calculatedDuration = time_spent_seconds != null ?
            Number(time_spent_seconds) :
            Math.max(0, Math.floor((endTime.getTime() - startTime.getTime()) / 1000));

        await pool.query(`
      UPDATE reading_sessions
      SET end_time = COALESCE($1::timestamp, CURRENT_TIMESTAMP),
          end_percent = $2,
          time_spent_seconds = $3
      WHERE id = $4 AND user_id = $5
    `, [
            end_time || null,
            end_percent != null ? Number(end_percent) : null,
            calculatedDuration,
            Number(sessionId),
            req.user.id
        ]);

        res.json({
            success: true,
            duration_seconds: calculatedDuration
        });
    } catch (error) {
        handleDbError(res, error, 'End reading session');
    }
});

/* ---------------------- Device Management ---------------------- */
app.get('/api/v1/devices', validateApiKey, async (req, res) => {
    const { include_inactive } = req.query;

    try {
        const result = await pool.query(`
      SELECT id, device_label, device_type, last_seen, active,
             (SELECT COUNT(*) FROM progress_snapshots WHERE device_id = d.id) AS total_snapshots,
             (SELECT MAX(created_at) FROM progress_snapshots WHERE device_id = d.id) AS last_activity
      FROM devices d
      WHERE user_id = $1 ${include_inactive === 'true' ? '' : 'AND active = TRUE'}
      ORDER BY last_seen DESC
    `, [req.user.id]);

        res.json(result.rows);
    } catch (error) {
        handleDbError(res, error, 'Get devices');
    }
});

app.put('/api/v1/devices/:deviceId', validateApiKey, async (req, res) => {
    const { deviceId } = req.params;
    const { device_label, active } = req.body;

    try {
        const updates = [];
        const params = [req.user.id];
        let paramIndex = 1;

        if (device_label) {
            updates.push(`device_label = $${++paramIndex}`);
            params.push(device_label);
        }
        if (active !== undefined) {
            updates.push(`active = $${++paramIndex}`);
            params.push(Boolean(active));
        }

        if (updates.length === 0) {
            return res.json({ success: true, message: 'No changes provided' });
        }

        updates.push(`last_seen = CURRENT_TIMESTAMP`);
        params.push(deviceId);

        const result = await pool.query(`
      UPDATE devices 
      SET ${updates.join(', ')}
      WHERE user_id = $1 AND id = $${params.length}
      RETURNING id
    `, params);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Device not found' });
        }

        res.json({ success: true });
    } catch (error) {
        handleDbError(res, error, 'Update device');
    }
});

app.delete('/api/v1/devices/:deviceId', validateApiKey, async (req, res) => {
    const { deviceId } = req.params;

    try {
        const result = await pool.query(`
      UPDATE devices 
      SET active = FALSE, last_seen = CURRENT_TIMESTAMP
      WHERE user_id = $1 AND id = $2
      RETURNING id
    `, [req.user.id, deviceId]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Device not found' });
        }

        res.json({ success: true, deactivated: true });
    } catch (error) {
        handleDbError(res, error, 'Deactivate device');
    }
});

/* ---------------------- Statistics API ---------------------- */
app.get('/api/v1/stats/summary', validateApiKey, async (req, res) => {
    try {
        const client = await pool.connect();
        try {
            const [
                totalNovels,
                statusCounts,
                avgProgress,
                sessionStats,
                bookmarkCount,
                deviceCount
            ] = await Promise.all([
                client.query(
                    `
          SELECT COUNT(DISTINCT novel_id) AS total
          FROM progress_snapshots
          WHERE user_id = $1
          `,
                    [req.user.id]
                ),

                client.query(
                    `
          SELECT status, COUNT(*) AS count
          FROM user_novel_meta
          WHERE user_id = $1 AND status <> 'removed'
          GROUP BY status
          `,
                    [req.user.id]
                ),

                // Cast to numeric for 2-arg ROUND
                client.query(
                    `
          WITH latest AS (
            SELECT DISTINCT ON (novel_id) novel_id, percent
            FROM progress_snapshots
            WHERE user_id = $1
            ORDER BY novel_id, created_at DESC
          )
          SELECT COALESCE(ROUND(AVG(percent)::numeric, 2), 0)::float AS avg_progress
          FROM latest
          `,
                    [req.user.id]
                ),

                // Cast to numeric for 2-arg ROUND on avg seconds
                client.query(
                    `
          SELECT
            COUNT(*) AS total_sessions,
            COALESCE(SUM(time_spent_seconds), 0) AS total_seconds,
            COALESCE(ROUND(AVG(time_spent_seconds)::numeric, 0), 0)::int AS avg_session_seconds
          FROM reading_sessions
          WHERE user_id = $1 AND end_time IS NOT NULL
          `,
                    [req.user.id]
                ),

                client.query(
                    `SELECT COUNT(*) AS total FROM bookmarks WHERE user_id = $1`,
                    [req.user.id]
                ),

                client.query(
                    `SELECT COUNT(*) AS total FROM devices WHERE user_id = $1 AND active = TRUE`,
                    [req.user.id]
                )
            ]);

            const statusMap = {};
            statusCounts.rows.forEach(row => {
                statusMap[row.status] = Number(row.count);
            });

            res.json({
                total_novels: Number(totalNovels.rows[0]?.total || 0),
                novels_by_status: {
                    reading: statusMap.reading || 0,
                    completed: statusMap.completed || 0,
                    'on-hold': statusMap['on-hold'] || 0,
                    dropped: statusMap.dropped || 0
                },
                avg_progress: Number(avgProgress.rows[0]?.avg_progress || 0),
                reading_sessions: {
                    total: Number(sessionStats.rows[0]?.total_sessions || 0),
                    total_time_seconds: Number(sessionStats.rows[0]?.total_seconds || 0),
                    avg_session_seconds: Number(sessionStats.rows[0]?.avg_session_seconds || 0)
                },
                total_bookmarks: Number(bookmarkCount.rows[0]?.total || 0),
                active_devices: Number(deviceCount.rows[0]?.total || 0)
            });
        } finally {
            client.release();
        }
    } catch (error) {
        handleDbError(res, error, 'Get statistics summary');
    }
});


app.get('/api/v1/stats/daily', validateApiKey, async (req, res) => {
    const { from, to, days = 30 } = req.query;

    const fromDate = from ? new Date(from) : new Date(Date.now() - (Number(days) * 24 * 60 * 60 * 1000));
    const toDate = to ? new Date(to) : new Date();

    try {
        const result = await pool.query(`
      WITH date_range AS (
        SELECT generate_series($2::date, $3::date, '1 day'::interval)::date AS date
      ),
      daily_snapshots AS (
        SELECT 
          DATE(created_at) AS date,
          COUNT(*) AS snapshot_events,
          COUNT(DISTINCT novel_id) AS novels_touched
        FROM progress_snapshots
        WHERE user_id = $1 
          AND created_at >= $2 
          AND created_at <= $3 + interval '1 day'
        GROUP BY DATE(created_at)
      ),
      daily_sessions AS (
        SELECT 
          DATE(start_time) AS date,
          COUNT(*) AS sessions,
          COALESCE(SUM(time_spent_seconds), 0) AS session_seconds
        FROM reading_sessions
        WHERE user_id = $1 
          AND start_time >= $2 
          AND start_time <= $3 + interval '1 day'
          AND end_time IS NOT NULL
        GROUP BY DATE(start_time)
      )
      SELECT 
        dr.date,
        COALESCE(ds.snapshot_events, 0) AS snapshot_events,
        COALESCE(ds.novels_touched, 0) AS novels_touched,
        COALESCE(sess.sessions, 0) AS sessions,
        COALESCE(sess.session_seconds, 0) AS session_seconds
      FROM date_range dr
      LEFT JOIN daily_snapshots ds ON dr.date = ds.date
      LEFT JOIN daily_sessions sess ON dr.date = sess.date
      ORDER BY dr.date ASC
    `, [req.user.id, fromDate.toISOString().split('T')[0], toDate.toISOString().split('T')[0]]);

        res.json(result.rows);
    } catch (error) {
        handleDbError(res, error, 'Get daily statistics');
    }
});

app.get('/api/v1/stats/novels/:novelId', validateApiKey, validateNovelId, async (req, res) => {
    const { novelId } = req.params;

    try {
        const client = await pool.connect();
        try {
            const [novelInfo, progressStats, sessionStats, bookmarkStats] = await Promise.all([
                client.query(`
          SELECT n.title, n.author, n.genre, m.status, m.favorite, m.rating,
                 m.started_at, m.completed_at
          FROM novels n
          LEFT JOIN user_novel_meta m ON m.novel_id = n.id AND m.user_id = $1
          WHERE n.id = $2
        `, [req.user.id, novelId]),

                client.query(`
          SELECT 
            COUNT(*) AS total_snapshots,
            MIN(created_at) AS first_read,
            MAX(created_at) AS last_read,
            MAX(percent) AS max_progress,
            COUNT(DISTINCT device_id) AS devices_used
          FROM progress_snapshots
          WHERE user_id = $1 AND novel_id = $2
        `, [req.user.id, novelId]),

                client.query(`
          SELECT 
            COUNT(*) AS total_sessions,
            COALESCE(SUM(time_spent_seconds), 0) AS total_time_seconds,
            ROUND(AVG(time_spent_seconds), 0) AS avg_session_seconds
          FROM reading_sessions
          WHERE user_id = $1 AND novel_id = $2 AND end_time IS NOT NULL
        `, [req.user.id, novelId]),

                client.query(`
          SELECT COUNT(*) AS total_bookmarks
          FROM bookmarks
          WHERE user_id = $1 AND novel_id = $2
        `, [req.user.id, novelId])
            ]);

            if (novelInfo.rows.length === 0) {
                return res.status(404).json({ error: 'Novel not found' });
            }

            res.json({
                novel: novelInfo.rows[0],
                progress: progressStats.rows[0],
                sessions: sessionStats.rows[0],
                bookmarks: { total: Number(bookmarkStats.rows[0].total_bookmarks) }
            });
        } finally {
            client.release();
        }
    } catch (error) {
        handleDbError(res, error, 'Get novel statistics');
    }
});

/* ---------------------- Debug Routes ---------------------- */
app.get('/api/v1/debug/last', validateApiKey, async (req, res) => {
    try {
        const result = await pool.query(`
      SELECT p.*, d.device_label, n.title
      FROM progress_snapshots p
      JOIN devices d ON d.id = p.device_id
      JOIN novels n ON n.id = p.novel_id
      WHERE p.user_id = $1
      ORDER BY p.created_at DESC
      LIMIT 1
    `, [req.user.id]);

        res.json({
            last_snapshot: result.rows[0] || null,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        handleDbError(res, error, 'Get last progress');
    }
});

/* ---------------------- Static File Serving ---------------------- */
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// Serve manage page
app.get('/manage', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'manage.html'));
});

// Redirect old novels page to MyList (clean integration)
app.get('/novels', (req, res) => {
    res.redirect('/mylist');
});

// Serve new MyList page
app.get('/mylist', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'mylist.html'));
});

app.get('/novel/:novelId', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'novel.html'));
});

// Redirect old detail page route to new canonical one
app.get('/novels/:novelId', (req, res) => {
    res.redirect('/novel/' + encodeURIComponent(req.params.novelId));
});

// 🔹 INTEGRATION: Admin panel route
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// 404 handler for API routes
app.use('/api/*', (req, res) => {
    res.status(404).json({
        error: 'API endpoint not found',
        path: req.path,
        method: req.method
    });
});

/* ---------------------- Environment Validation ---------------------- */
function validateEnvironment() {
    const required = ['DATABASE_URL'];
    const missing = required.filter(key => !process.env[key]);

    if (missing.length > 0) {
        console.error('❌ Missing required environment variables:');
        missing.forEach(key => console.error(`   - ${key}`));
        console.error('\nPlease set these environment variables before starting the server.');
        process.exit(1);
    }

    // Validate optional variables with defaults
    const optional = {
        PORT: process.env.PORT || '3000',
        NODE_ENV: process.env.NODE_ENV || 'development',
        ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS || 'default'
    };

    console.log('✅ Environment variables validated');
    console.log(`   PORT: ${optional.PORT}`);
    console.log(`   NODE_ENV: ${optional.NODE_ENV}`);
    console.log(`   ALLOWED_ORIGINS: ${optional.ALLOWED_ORIGINS}`);
}

/* ---------------------- Server Startup ---------------------- */
async function startServer() {
    try {
        // Validate environment variables first
        validateEnvironment();

        await initDatabase();

        // 🔹 INTEGRATION: Start the chapter update bot
        if (bot) {
            console.log('🤖 Starting chapter update bot...');
            bot.startBot().catch(err => {
                console.error('⚠️ Bot failed to start:', err);
                console.log('📝 Server will continue without bot');
            });
        }

        // WebSocket authentication and room management
        io.use(async (socket, next) => {
            const apiKey = socket.handshake.auth?.apiKey || socket.handshake.query?.apiKey;
            if (!apiKey) {
                return next(new Error('API key required'));
            }

            try {
                const result = await pool.query('SELECT id FROM users WHERE api_key = $1', [apiKey]);
                if (result.rows.length === 0) {
                    return next(new Error('Invalid API key'));
                }

                socket.userId = result.rows[0].id;
                next();
            } catch (error) {
                next(new Error('Authentication failed'));
            }
        });

        io.on('connection', (socket) => {
            const userId = socket.userId;
            const room = `user:${userId}`;

            socket.join(room);
            console.log(`🔌 WebSocket: User ${userId} connected (room: ${room})`);

            socket.on('disconnect', () => {
                console.log(`🔌 WebSocket: User ${userId} disconnected`);
            });

            // Allow clients to subscribe to specific novels
            socket.on('subscribe:novel', (novelId) => {
                socket.join(`novel:${novelId}`);
            });

            socket.on('unsubscribe:novel', (novelId) => {
                socket.leave(`novel:${novelId}`);
            });
        });

        httpServer.listen(PORT, '0.0.0.0', () => {
            console.log(`🚀 ReadSync API server running on port ${PORT}`);
            console.log(`📊 Dashboard: http://localhost:${PORT}`);
            console.log(`📚 MyList: http://localhost:${PORT}/mylist`);
            console.log(`🛠️ Manage: http://localhost:${PORT}/manage`);
            console.log(`🤖 Admin Panel: http://localhost:${PORT}/admin`);
            console.log(`🩺 Health check: http://localhost:${PORT}/health`);
            console.log(`📚 API docs: http://localhost:${PORT}/api/v1/`);
            console.log(`🔌 WebSocket server ready`);
        });

        // Graceful shutdown
        process.on('SIGTERM', () => {
            console.log('SIGTERM received, shutting down gracefully...');
            httpServer.close(() => {
                io.close();
                pool.end().then(() => {
                    console.log('Database pool closed');
                    process.exit(0);
                });
            });
        });

        process.on('SIGINT', () => {
            console.log('SIGINT received, shutting down gracefully...');
            httpServer.close(() => {
                io.close();
                pool.end().then(() => {
                    console.log('Database pool closed');
                    process.exit(0);
                });
            });
        });

    } catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
}

// Export database utilities for use by bot (must be before startServer)
module.exports = {
    forceNoVerify,
    createPool
};

// Only start server if this file is run directly
if (require.main === module) {
    startServer();
}