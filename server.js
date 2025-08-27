// server.js
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

/* ---------------------- Middleware ---------------------- */
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// /* ---------------------- Postgres ------------------------ */
// const rawDbUrl = process.env.DATABASE_URL || '';

// /**
//  * Use SSL for any cloud DB (Supabase, Railway, RDS, etc.) or when in production.
//  * Also ensure the connection string includes ?sslmode=require to keep pg happy.
//  */
// const mustUseSSL =
//     /supabase\.com|railway\.app|amazonaws\.com|azure|googleapis\.com|cloudsql|pooler\./i.test(rawDbUrl) ||
//     process.env.NODE_ENV === 'production';

// const connectionString =
//     rawDbUrl && !/sslmode=/i.test(rawDbUrl)
//         ? `${rawDbUrl}${rawDbUrl.includes('?') ? '&' : '?'}sslmode=require`
//         : rawDbUrl;

// const pool = new Pool({
//     connectionString,
//     // tune as needed via envs; these defaults are safe
//     max: Number(process.env.PG_POOL_MAX || 10),
//     idleTimeoutMillis: Number(process.env.PG_IDLE_TIMEOUT || 30_000),
//     connectionTimeoutMillis: Number(process.env.PG_CONN_TIMEOUT || 10_000),
//     keepAlive: true,
//     // For Supabase/most managed PG with self-signed chain:
//     ssl: mustUseSSL ? { rejectUnauthorized: false } : false,
// });

// // helpful error logging so we can see if the pool drops connections
// pool.on('error', (err) => {
//     console.error('❌ PG Pool error (probably a network issue or idle timeout):', err);
// });

// /**
//  * Optional: quick connection assertion at boot so we fail fast if DATABASE_URL is wrong.
//  * Comment this out if you prefer the app to boot even if DB is briefly unavailable.
//  */
// (async function assertDbConnection() {
//     try {
//         await pool.query('select 1');
//         console.log('✅ PostgreSQL connected');
//     } catch (e) {
//         console.error('❌ DB connection failed at startup:', e);
//         // Exit non-zero so the platform restarts the container
//         process.exit(1);
//     }
// })();

// /* --- tiny healthcheck endpoint for Railway/uptime checks --- */
// app.get('/healthz', async (_req, res) => {
//     try {
//         await pool.query('select 1');
//         res.json({ ok: true });
//     } catch (e) {
//         res.status(500).json({ ok: false, error: e.message });
//     }
// });


/* ---------------------- Postgres (Supabase-friendly) ---------------------- */
const raw = process.env.DATABASE_URL || '';
if (!raw) {
    console.error('DATABASE_URL is not set'); process.exit(1);
}

// Ensure sslmode=no-verify in the URL (overrides “self-signed” issues)
let urlStr = raw;
try {
    const u = new URL(raw);
    if (!u.searchParams.has('sslmode')) u.searchParams.set('sslmode', 'no-verify');
    urlStr = u.toString();
} catch {
    // fallback if DATABASE_URL is not a standard URL (rare)
    if (!/sslmode=/.test(raw)) urlStr = raw + (raw.includes('?') ? '&' : '?') + 'sslmode=no-verify';
}

const pool = new Pool({
    connectionString: urlStr,
    ssl: { rejectUnauthorized: false },     // belt-and-suspenders for node-postgres
    max: Number(process.env.PG_POOL_MAX || 10),
    idleTimeoutMillis: Number(process.env.PG_IDLE_TIMEOUT || 30000),
    connectionTimeoutMillis: Number(process.env.PG_CONN_TIMEOUT || 10000),
    keepAlive: true,
});

pool.on('error', (err) => {
    console.error('PG pool error:', err);
});

// Optional: health endpoint
app.get('/healthz', async (_req, res) => {
    try { await pool.query('select 1'); res.json({ ok: true }); }
    catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});


/* ---------------------- Schema Init --------------------- */
async function initDatabase() {
    const client = await pool.connect();
    try {
        // Users
        await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        display_name TEXT,
        api_key TEXT UNIQUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

        // Devices
        await client.query(`
      CREATE TABLE IF NOT EXISTS devices (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        device_label TEXT,
        user_agent TEXT,
        last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id)
      )
    `);

        // Novels
        await client.query(`
      CREATE TABLE IF NOT EXISTS novels (
        id TEXT PRIMARY KEY,
        title TEXT,
        primary_url TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

        // Progress snapshots
        await client.query(`
      CREATE TABLE IF NOT EXISTS progress_snapshots (
        id SERIAL PRIMARY KEY,
        user_id TEXT,
        device_id TEXT,
        novel_id TEXT,
        chapter_token TEXT,
        chapter_num INTEGER,
        chapter_slug_extra TEXT,
        percent REAL,
        url TEXT,
        seconds_on_page INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id),
        FOREIGN KEY (device_id) REFERENCES devices (id),
        FOREIGN KEY (novel_id) REFERENCES novels (id)
      )
    `);

        // Indexes
        await client.query(`
      CREATE INDEX IF NOT EXISTS idx_progress_user_novel
      ON progress_snapshots (user_id, novel_id, created_at DESC)
    `);
        await client.query(`
      CREATE INDEX IF NOT EXISTS idx_progress_device
      ON progress_snapshots (device_id, novel_id, created_at DESC)
    `);

        // Demo user
        await client.query(`
      INSERT INTO users (id, display_name, api_key)
      VALUES ('demo-user', 'Demo User', 'demo-api-key-12345')
      ON CONFLICT (id) DO NOTHING
    `);

        console.log('Database initialized successfully');
    } catch (error) {
        console.error('Database initialization error:', error);
        throw error;
    } finally {
        client.release();
    }
}

/* ---------------------- Helpers ------------------------- */
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
    const m = url.match(/\/(c?chapter)-(\d+)(?:-\d+)?/i);
    if (!m) return null;
    return { token: m[1], num: parseInt(m[2], 10) };
}

async function getLatestStates(client, userId, novelId) {
    // Global latest across devices
    const globalResult = await client.query(
        `
      SELECT p.*, d.device_label, d.last_seen AS device_last_seen
      FROM progress_snapshots p
      JOIN devices d ON p.device_id = d.id
      WHERE p.user_id = $1 AND p.novel_id = $2
      ORDER BY p.chapter_num DESC, p.percent DESC, p.created_at DESC
      LIMIT 1
    `,
        [userId, novelId]
    );

    // Latest per device
    const deviceResult = await client.query(
        `
      SELECT DISTINCT ON (p.device_id) p.*, d.device_label
      FROM progress_snapshots p
      JOIN devices d ON p.device_id = d.id
      WHERE p.user_id = $1 AND p.novel_id = $2
      ORDER BY p.device_id, p.created_at DESC
    `,
        [userId, novelId]
    );

    const latest_global =
        globalResult.rows.length > 0
            ? {
                chapter_num: globalResult.rows[0].chapter_num,
                chapter_token: globalResult.rows[0].chapter_token,
                percent: globalResult.rows[0].percent,
                device_id: globalResult.rows[0].device_id,
                device_label: globalResult.rows[0].device_label,
                url: globalResult.rows[0].url,
                ts: globalResult.rows[0].created_at,
            }
            : null;

    const latest_per_device = {};
    deviceResult.rows.forEach((row) => {
        latest_per_device[row.device_id] = {
            chapter_num: row.chapter_num,
            chapter_token: row.chapter_token,
            percent: row.percent,
            device_label: row.device_label,
            url: row.url,
            ts: row.created_at,
        };
    });

    return { latest_global, latest_per_device };
}

/* ---------------------- API Routes ---------------------- */

// 0) Healthcheck
app.get('/health', async (req, res) => {
    try {
        await pool.query('SELECT 1');
        res.json({ ok: true });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// 1) Upsert progress
app.post('/api/v1/progress', async (req, res) => {
    const {
        user_key,
        device_id,
        device_label,
        novel_url,
        percent,
        seconds_on_page = 0,
    } = req.body;

    const client = await pool.connect();
    try {
        // Validate user
        const userResult = await client.query('SELECT id FROM users WHERE api_key = $1', [user_key]);
        if (userResult.rows.length === 0) {
            return res.status(401).json({ error: 'Invalid API key' });
        }

        const user_id = userResult.rows[0].id;
        const novel_id = normalizeNovelId(novel_url);
        const novel_title = extractNovelTitle(novel_url);
        const chapterInfo = parseChapterFromUrl(novel_url);

        if (!novel_id || !chapterInfo) {
            return res.status(400).json({ error: 'Invalid novel URL format' });
        }

        // Upsert device
        await client.query(
            `
        INSERT INTO devices (id, user_id, device_label, last_seen)
        VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
        ON CONFLICT (id) DO UPDATE SET
          device_label = EXCLUDED.device_label,
          last_seen = CURRENT_TIMESTAMP
      `,
            [device_id, user_id, device_label]
        );

        // Upsert novel
        await client.query(
            `
        INSERT INTO novels (id, title, primary_url)
        VALUES ($1, $2, $3)
        ON CONFLICT (id) DO NOTHING
      `,
            [novel_id, novel_title, novel_url]
        );

        // Max-progress policy
        const last = await client.query(
            `
        SELECT percent, chapter_num
        FROM progress_snapshots
        WHERE user_id = $1 AND device_id = $2 AND novel_id = $3
        ORDER BY created_at DESC
        LIMIT 1
      `,
            [user_id, device_id, novel_id]
        );

        let shouldUpdate = true;
        if (last.rows.length > 0) {
            const prev = last.rows[0];
            if (prev.chapter_num === chapterInfo.num && percent <= prev.percent) shouldUpdate = false;
            if (chapterInfo.num < prev.chapter_num) shouldUpdate = false;
            if (percent <= 1 && prev.percent > 10 && prev.chapter_num === chapterInfo.num) shouldUpdate = false;
        }

        if (shouldUpdate) {
            await client.query(
                `
          INSERT INTO progress_snapshots
            (user_id, device_id, novel_id, chapter_token, chapter_num, percent, url, seconds_on_page)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `,
                [user_id, device_id, novel_id, chapterInfo.token, chapterInfo.num, percent, novel_url, seconds_on_page]
            );
        }

        const states = await getLatestStates(client, user_id, novel_id);
        res.json({
            status: 'ok',
            updated: shouldUpdate,
            latest_global: states.latest_global,
            latest_per_device: states.latest_per_device,
        });
    } catch (error) {
        console.error('Progress update error:', error);
        res.status(500).json({ error: 'Database error', detail: error.message });
    } finally {
        client.release();
    }
});

// 2) Get latest progress for a novel
app.get('/api/v1/progress', async (req, res) => {
    const { user_key, novel_id } = req.query;

    const client = await pool.connect();
    try {
        const userResult = await client.query('SELECT id FROM users WHERE api_key = $1', [user_key]);
        if (userResult.rows.length === 0) {
            return res.status(401).json({ error: 'Invalid API key' });
        }

        const states = await getLatestStates(client, userResult.rows[0].id, novel_id);
        res.json(states);
    } catch (error) {
        console.error('Get progress error:', error);
        res.status(500).json({ error: 'Database error', detail: error.message });
    } finally {
        client.release();
    }
});

// 3) Compare states (ahead/behind logic)
app.get('/api/v1/compare', async (req, res) => {
    const { user_key, novel_id, device_id } = req.query;

    const client = await pool.connect();
    try {
        const userResult = await client.query('SELECT id FROM users WHERE api_key = $1', [user_key]);
        if (userResult.rows.length === 0) {
            return res.status(401).json({ error: 'Invalid API key' });
        }

        const states = await getLatestStates(client, userResult.rows[0].id, novel_id);
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

        if (globalState.device_id === device_id) shouldPrompt = false;

        res.json({
            device_state: deviceState,
            global_state: globalState,
            delta: { chapters_ahead: chapterDiff, percent_diff: percentDiff },
            should_prompt_jump: shouldPrompt,
        });
    } catch (error) {
        console.error('Compare error:', error);
        res.status(500).json({ error: 'Database error', detail: error.message });
    } finally {
        client.release();
    }
});

// 4) List all novels for dashboard (most recent first)
app.get('/api/v1/novels', async (req, res) => {
    const { user_key } = req.query;

    const client = await pool.connect();
    try {
        const userResult = await client.query('SELECT id FROM users WHERE api_key = $1', [user_key]);
        if (userResult.rows.length === 0) {
            return res.status(401).json({ error: 'Invalid API key' });
        }

        const user_id = userResult.rows[0].id;

        // Most recent activity per novel
        const novelsResult = await client.query(
            `
        SELECT
          n.id,
          n.title,
          n.primary_url,
          MAX(p.created_at) AS last_seen
        FROM novels n
        JOIN progress_snapshots p ON n.id = p.novel_id
        WHERE p.user_id = $1
        GROUP BY n.id, n.title, n.primary_url
        ORDER BY last_seen DESC
      `,
            [user_id]
        );

        const results = [];
        for (const novel of novelsResult.rows) {
            const states = await getLatestStates(client, user_id, novel.id);
            results.push({
                novel_id: novel.id,
                title: novel.title,
                primary_url: novel.primary_url,
                latest_global: states.latest_global,
                latest_per_device: states.latest_per_device,
            });
        }

        res.json(results);
    } catch (error) {
        console.error('Novels list error:', error);
        res.status(500).json({ error: 'Database error', detail: error.message });
    } finally {
        client.release();
    }
});

/* ------------------ Debug convenience route ------------- */
// Most recent snapshot across all novels for this API key
app.get('/api/v1/debug/last', async (req, res) => {
    const { user_key } = req.query;
    const client = await pool.connect();
    try {
        const u = await client.query('SELECT id FROM users WHERE api_key = $1', [user_key]);
        if (u.rows.length === 0) return res.status(401).json({ error: 'Invalid API key' });
        const user_id = u.rows[0].id;

        const r = await client.query(
            `
        SELECT p.*, d.device_label, n.title
        FROM progress_snapshots p
        JOIN devices d ON d.id = p.device_id
        JOIN novels n  ON n.id = p.novel_id
        WHERE p.user_id = $1
        ORDER BY p.created_at DESC
        LIMIT 1
      `,
            [user_id]
        );

        res.json({ last: r.rows[0] || null });
    } catch (e) {
        console.error('Debug last error:', e);
        res.status(500).json({ error: 'Database error', detail: e.message });
    } finally {
        client.release();
    }
});

/* ---------------------- Static UI ----------------------- */
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

/* ----------------------- Launch ------------------------- */
initDatabase()
    .then(() => {
        app.listen(PORT, '0.0.0.0', () => {
            console.log(`ReadSync API server running on port ${PORT}`);
            console.log(`Dashboard: http://localhost:${PORT}`);
        });
    })
    .catch((error) => {
        console.error('Failed to initialize database:', error);
        process.exit(1);
    });
