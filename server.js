const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Initialize SQLite Database
const db = new sqlite3.Database('readsync.db');

// Initialize tables
db.serialize(() => {
    // Users table
    db.run(`CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    display_name TEXT,
    api_key TEXT UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

    // Devices table
    db.run(`CREATE TABLE IF NOT EXISTS devices (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    device_label TEXT,
    user_agent TEXT,
    last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id)
  )`);

    // Novels table
    db.run(`CREATE TABLE IF NOT EXISTS novels (
    id TEXT PRIMARY KEY,
    title TEXT,
    primary_url TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

    // Progress snapshots table
    db.run(`CREATE TABLE IF NOT EXISTS progress_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT,
    device_id TEXT,
    novel_id TEXT,
    chapter_token TEXT,
    chapter_num INTEGER,
    chapter_slug_extra TEXT,
    percent REAL,
    url TEXT,
    seconds_on_page INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id),
    FOREIGN KEY (device_id) REFERENCES devices (id),
    FOREIGN KEY (novel_id) REFERENCES novels (id)
  )`);

    // Create indexes
    db.run(`CREATE INDEX IF NOT EXISTS idx_progress_user_novel 
          ON progress_snapshots (user_id, novel_id, created_at DESC)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_progress_device 
          ON progress_snapshots (device_id, novel_id, created_at DESC)`);

    // Insert default user for demo
    db.run(`INSERT OR IGNORE INTO users (id, display_name, api_key) 
          VALUES ('demo-user', 'Demo User', 'demo-api-key-12345')`);
});

// Helper functions
function normalizeNovelId(url) {
    // Extract novel slug from URL and normalize
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
app.post('/api/v1/progress', (req, res) => {
    const {
        user_key,
        device_id,
        device_label,
        novel_url,
        percent,
        seconds_on_page = 0
    } = req.body;

    // Validate user
    db.get('SELECT id FROM users WHERE api_key = ?', [user_key], (err, user) => {
        if (err || !user) {
            return res.status(401).json({ error: 'Invalid API key' });
        }

        const user_id = user.id;
        const novel_id = normalizeNovelId(novel_url);
        const novel_title = extractNovelTitle(novel_url);
        const chapterInfo = parseChapterFromUrl(novel_url);

        if (!novel_id || !chapterInfo) {
            return res.status(400).json({ error: 'Invalid novel URL format' });
        }

        // Upsert device
        db.run(`INSERT OR REPLACE INTO devices (id, user_id, device_label, last_seen) 
            VALUES (?, ?, ?, CURRENT_TIMESTAMP)`,
            [device_id, user_id, device_label]);

        // Upsert novel
        db.run(`INSERT OR IGNORE INTO novels (id, title, primary_url) 
            VALUES (?, ?, ?)`,
            [novel_id, novel_title, novel_url]);

        // Check if we should update progress (max-progress policy)
        db.get(`SELECT percent, chapter_num FROM progress_snapshots 
            WHERE user_id = ? AND device_id = ? AND novel_id = ? 
            ORDER BY created_at DESC LIMIT 1`,
            [user_id, device_id, novel_id], (err, lastProgress) => {

                let shouldUpdate = true;

                if (lastProgress) {
                    // Same chapter: only update if percent is higher
                    if (lastProgress.chapter_num === chapterInfo.num && percent <= lastProgress.percent) {
                        shouldUpdate = false;
                    }
                    // Lower chapter: don't update (unless significant time has passed)
                    if (chapterInfo.num < lastProgress.chapter_num) {
                        shouldUpdate = false;
                    }
                    // Guard against accidental resets (0-1% when was >10%)
                    if (percent <= 1 && lastProgress.percent > 10 && lastProgress.chapter_num === chapterInfo.num) {
                        shouldUpdate = false;
                    }
                }

                if (shouldUpdate) {
                    // Insert new progress snapshot
                    db.run(`INSERT INTO progress_snapshots 
                  (user_id, device_id, novel_id, chapter_token, chapter_num, 
                   percent, url, seconds_on_page) 
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                        [user_id, device_id, novel_id, chapterInfo.token, chapterInfo.num,
                            percent, novel_url, seconds_on_page], function (err) {

                                if (err) {
                                    return res.status(500).json({ error: 'Database error' });
                                }

                                // Get latest states for response
                                getLatestStates(user_id, novel_id, (states) => {
                                    res.json({
                                        status: 'ok',
                                        updated: true,
                                        latest_global: states.latest_global,
                                        latest_per_device: states.latest_per_device
                                    });
                                });
                            });
                } else {
                    // No update needed, just return current states
                    getLatestStates(user_id, novel_id, (states) => {
                        res.json({
                            status: 'ok',
                            updated: false,
                            reason: 'Max progress policy - no update needed',
                            latest_global: states.latest_global,
                            latest_per_device: states.latest_per_device
                        });
                    });
                }
            });
    });
});

// 2. Get latest progress for a novel
app.get('/api/v1/progress', (req, res) => {
    const { user_key, novel_id } = req.query;

    db.get('SELECT id FROM users WHERE api_key = ?', [user_key], (err, user) => {
        if (err || !user) {
            return res.status(401).json({ error: 'Invalid API key' });
        }

        getLatestStates(user.id, novel_id, (states) => {
            res.json(states);
        });
    });
});

// 3. Compare states (ahead/behind logic)
app.get('/api/v1/compare', (req, res) => {
    const { user_key, novel_id, device_id } = req.query;

    db.get('SELECT id FROM users WHERE api_key = ?', [user_key], (err, user) => {
        if (err || !user) {
            return res.status(401).json({ error: 'Invalid API key' });
        }

        getLatestStates(user.id, novel_id, (states) => {
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
                shouldPrompt = true; // Global is ahead by chapters
            } else if (chapterDiff === 0 && percentDiff >= 5.0) {
                shouldPrompt = true; // Same chapter but significant % difference
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
        });
    });
});

// 4. List all novels for dashboard
app.get('/api/v1/novels', (req, res) => {
    const { user_key } = req.query;

    db.get('SELECT id FROM users WHERE api_key = ?', [user_key], (err, user) => {
        if (err || !user) {
            return res.status(401).json({ error: 'Invalid API key' });
        }

        // Get all novels with progress for this user
        db.all(`SELECT DISTINCT n.id, n.title, n.primary_url 
            FROM novels n 
            JOIN progress_snapshots p ON n.id = p.novel_id 
            WHERE p.user_id = ?
            ORDER BY MAX(p.created_at) DESC`,
            [user.id], (err, novels) => {

                if (err) {
                    return res.status(500).json({ error: 'Database error' });
                }

                // Get states for each novel
                const novelPromises = novels.map(novel => {
                    return new Promise((resolve) => {
                        getLatestStates(user.id, novel.id, (states) => {
                            resolve({
                                novel_id: novel.id,
                                title: novel.title,
                                primary_url: novel.primary_url,
                                latest_global: states.latest_global,
                                latest_per_device: states.latest_per_device
                            });
                        });
                    });
                });

                Promise.all(novelPromises).then(results => {
                    res.json(results);
                });
            });
    });
});

// Helper function to get latest states
function getLatestStates(userId, novelId, callback) {
    // Get global latest (highest chapter/percent across all devices)
    db.get(`SELECT p.*, d.device_label, d.last_seen as device_last_seen
          FROM progress_snapshots p
          JOIN devices d ON p.device_id = d.id
          WHERE p.user_id = ? AND p.novel_id = ?
          ORDER BY p.chapter_num DESC, p.percent DESC, p.created_at DESC
          LIMIT 1`,
        [userId, novelId], (err, globalRow) => {

            // Get latest per device
            db.all(`SELECT p.*, d.device_label 
              FROM progress_snapshots p
              JOIN devices d ON p.device_id = d.id
              WHERE p.user_id = ? AND p.novel_id = ?
              AND p.id IN (
                SELECT MAX(id) FROM progress_snapshots 
                WHERE user_id = ? AND novel_id = ? 
                GROUP BY device_id
              )
              ORDER BY p.created_at DESC`,
                [userId, novelId, userId, novelId], (err, deviceRows) => {

                    const latest_global = globalRow ? {
                        chapter_num: globalRow.chapter_num,
                        chapter_token: globalRow.chapter_token,
                        percent: globalRow.percent,
                        device_id: globalRow.device_id,
                        device_label: globalRow.device_label,
                        url: globalRow.url,
                        ts: globalRow.created_at
                    } : null;

                    const latest_per_device = {};
                    deviceRows.forEach(row => {
                        latest_per_device[row.device_id] = {
                            chapter_num: row.chapter_num,
                            chapter_token: row.chapter_token,
                            percent: row.percent,
                            device_label: row.device_label,
                            url: row.url,
                            ts: row.created_at
                        };
                    });

                    callback({
                        latest_global,
                        latest_per_device
                    });
                });
        });
}

// Serve the dashboard
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`ReadSync API server running on http://0.0.0.0:${PORT}`);
    console.log(`Access from other devices: http://192.168.0.15:${PORT}`);
});



// app.listen(PORT, () => {
//     console.log(`ReadSync API server running on http://localhost:${PORT}`);
//     console.log(`Dashboard available at http://localhost:${PORT}`);
//     console.log(`Demo API key: demo-api-key-12345`);
// });