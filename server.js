const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Initialize PostgreSQL connection
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Initialize tables
async function initDatabase() {
    const client = await pool.connect();
    try {
        // Users table
        await client.query(`CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      display_name TEXT,
      api_key TEXT UNIQUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);

        // Devices table
        await client.query(`CREATE TABLE IF NOT EXISTS devices (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      device_label TEXT,
      user_agent TEXT,
      last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users (id)
    )`);

        // Novels table
        await client.query(`CREATE TABLE IF NOT EXISTS novels (
      id TEXT PRIMARY KEY,
      title TEXT,
      primary_url TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);

        // Progress snapshots table
        await client.query(`CREATE TABLE IF NOT EXISTS progress_snapshots (
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
    )`);

        // Create indexes
        await client.query(`CREATE INDEX IF NOT EXISTS idx_progress_user_novel 
            ON progress_snapshots (user_id, novel_id, created_at DESC)`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_progress_device 
            ON progress_snapshots (device_id, novel_id, created_at DESC)`);

        // Insert default user for demo
        await client.query(`INSERT INTO users (id, display_name, api_key) 
            VALUES ('demo-user', 'Demo User', 'demo-api-key-12345') 
            ON CONFLICT (id) DO NOTHING`);

        console.log('Database initialized successfully');
    } catch (error) {
        console.error('Database initialization error:', error);
    } finally {
        client.release();
    }
}

// Helper functions
function normalizeNovelId(url) {
    const match = url.match(/\/b\/([^\/]+)/);
    if (match) {
        return `novelbin:${match[1].toLowerCase()}`;
    }
    return null;
}

function extractNovelTitle(url) {
    const match = url.match(/\/b\/([^\/]+)/);
    if (match) {
        return match[1].replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    }
    return 'Unknown Novel';
}

function parseChapterFromUrl(url) {
    const match = url.match(/\/(c?chapter)-(\d+)(?:-\d+)?/i);
    if (match) {
        return {
            token: match[1],
            num: parseInt(match[2], 10)
        };
    }
    return null;
}

// API Routes

// 1. Upsert progress
app.post('/api/v1/progress', async (req, res) => {
    const {
        user_key,
        device_id,
        device_label,
        novel_url,
        percent,
        seconds_on_page = 0
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
        await client.query(`INSERT INTO devices (id, user_id, device_label, last_seen) 
            VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
            ON CONFLICT (id) DO UPDATE SET 
            device_label = EXCLUDED.device_label, 
            last_seen = CURRENT_TIMESTAMP`,
            [device_id, user_id, device_label]);

        // Upsert novel
        await client.query(`INSERT INTO novels (id, title, primary_url) 
            VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING`,
            [novel_id, novel_title, novel_url]);

        // Check if we should update progress (max-progress policy)
        const lastProgressResult = await client.query(`SELECT percent, chapter_num FROM progress_snapshots 
            WHERE user_id = $1 AND device_id = $2 AND novel_id = $3 
            ORDER BY created_at DESC LIMIT 1`,
            [user_id, device_id, novel_id]);

        let shouldUpdate = true;

        if (lastProgressResult.rows.length > 0) {
            const lastProgress = lastProgressResult.rows[0];

            // Same chapter: only update if percent is higher
            if (lastProgress.chapter_num === chapterInfo.num && percent <= lastProgress.percent) {
                shouldUpdate = false;
            }
            // Lower chapter: don't update
            if (chapterInfo.num < lastProgress.chapter_num) {
                shouldUpdate = false;
            }
            // Guard against accidental resets
            if (percent <= 1 && lastProgress.percent > 10 && lastProgress.chapter_num === chapterInfo.num) {
                shouldUpdate = false;
            }
        }

        if (shouldUpdate) {
            // Insert new progress snapshot
            await client.query(`INSERT INTO progress_snapshots 
              (user_id, device_id, novel_id, chapter_token, chapter_num, 
               percent, url, seconds_on_page) 
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                [user_id, device_id, novel_id, chapterInfo.token, chapterInfo.num,
                    percent, novel_url, seconds_on_page]);

            // Get latest states for response
            const states = await getLatestStates(client, user_id, novel_id);
            res.json({
                status: 'ok',
                updated: true,
                latest_global: states.latest_global,
                latest_per_device: states.latest_per_device
            });
        } else {
            // No update needed, just return current states
            const states = await getLatestStates(client, user_id, novel_id);
            res.json({
                status: 'ok',
                updated: false,
                reason: 'Max progress policy - no update needed',
                latest_global: states.latest_global,
                latest_per_device: states.latest_per_device
            });
        }
    } catch (error) {
        console.error('Progress update error:', error);
        res.status(500).json({ error: 'Database error' });
    } finally {
        client.release();
    }
});

// 2. Get latest progress for a novel
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
        res.status(500).json({ error: 'Database error' });
    } finally {
        client.release();
    }
});

// 3. Compare states (ahead/behind logic)
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
                should_prompt_jump: false
            });
        }

        // Calculate delta
        const chapterDiff = globalState.chapter_num - deviceState.chapter_num;
        const percentDiff = globalState.percent - deviceState.percent;

        // Decision logic
        let shouldPrompt = false;
        if (chapterDiff > 0) {
            shouldPrompt = true;
        } else if (chapterDiff === 0 && percentDiff >= 5.0) {
            shouldPrompt = true;
        }

        // Don't prompt if this device IS the global leader
        if (globalState.device_id === device_id) {
            shouldPrompt = false;
        }

        res.json({
            device_state: deviceState,
            global_state: globalState,
            delta: {
                chapters_ahead: chapterDiff,
                percent_diff: percentDiff
            },
            should_prompt_jump: shouldPrompt
        });
    } catch (error) {
        console.error('Compare error:', error);
        res.status(500).json({ error: 'Database error' });
    } finally {
        client.release();
    }
});

// 4. List all novels for dashboard
app.get('/api/v1/novels', async (req, res) => {
    const { user_key } = req.query;

    const client = await pool.connect();
    try {
        const userResult = await client.query('SELECT id FROM users WHERE api_key = $1', [user_key]);
        if (userResult.rows.length === 0) {
            return res.status(401).json({ error: 'Invalid API key' });
        }

        const user_id = userResult.rows[0].id;

        // Get all novels with progress for this user
        const novelsResult = await client.query(`SELECT DISTINCT n.id, n.title, n.primary_url 
            FROM novels n 
            JOIN progress_snapshots p ON n.id = p.novel_id 
            WHERE p.user_id = $1
            ORDER BY MAX(p.created_at) DESC`,
            [user_id]);

        const results = [];
        for (const novel of novelsResult.rows) {
            const states = await getLatestStates(client, user_id, novel.id);
            results.push({
                novel_id: novel.id,
                title: novel.title,
                primary_url: novel.primary_url,
                latest_global: states.latest_global,
                latest_per_device: states.latest_per_device
            });
        }

        res.json(results);
    } catch (error) {
        console.error('Novels list error:', error);
        res.status(500).json({ error: 'Database error' });
    } finally {
        client.release();
    }
});

// Helper function to get latest states
async function getLatestStates(client, userId, novelId) {
    // Get global latest
    const globalResult = await client.query(`SELECT p.*, d.device_label, d.last_seen as device_last_seen
          FROM progress_snapshots p
          JOIN devices d ON p.device_id = d.id
          WHERE p.user_id = $1 AND p.novel_id = $2
          ORDER BY p.chapter_num DESC, p.percent DESC, p.created_at DESC
          LIMIT 1`,
        [userId, novelId]);

    // Get latest per device
    const deviceResult = await client.query(`SELECT DISTINCT ON (p.device_id) p.*, d.device_label
          FROM progress_snapshots p
          JOIN devices d ON p.device_id = d.id
          WHERE p.user_id = $1 AND p.novel_id = $2
          ORDER BY p.device_id, p.created_at DESC`,
        [userId, novelId]);

    const latest_global = globalResult.rows.length > 0 ? {
        chapter_num: globalResult.rows[0].chapter_num,
        chapter_token: globalResult.rows[0].chapter_token,
        percent: globalResult.rows[0].percent,
        device_id: globalResult.rows[0].device_id,
        device_label: globalResult.rows[0].device_label,
        url: globalResult.rows[0].url,
        ts: globalResult.rows[0].created_at
    } : null;

    const latest_per_device = {};
    deviceResult.rows.forEach(row => {
        latest_per_device[row.device_id] = {
            chapter_num: row.chapter_num,
            chapter_token: row.chapter_token,
            percent: row.percent,
            device_label: row.device_label,
            url: row.url,
            ts: row.created_at
        };
    });

    return {
        latest_global,
        latest_per_device
    };
}

// Serve the dashboard
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// Initialize database and start server
initDatabase().then(() => {
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`ReadSync API server running on port ${PORT}`);
        console.log(`Dashboard available at http://localhost:${PORT}`);
    });
}).catch(error => {
    console.error('Failed to initialize database:', error);
    process.exit(1);
});