const { createPool } = require('./server');

/* ==================== Configuration ==================== */
const CHECK_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes
const BATCH_SIZE = 5; // Check 5 novels at a time
const REQUEST_DELAY_MS = 5000; // 5s delay between requests (be nice to servers)
const STALE_THRESHOLD_HOURS = 24; // Update if not checked in 24 hours

// Error management constants
const MAX_ERRORS = 100; // Maximum errors to keep in array
const RETAIN_ERRORS = 50; // Number of errors to retain when limit exceeded

// Timeout constants
const FETCH_TIMEOUT_MS = 10000; // 10 seconds timeout for HTTP requests
const GRACEFUL_SHUTDOWN_WAIT_SECONDS = 60; // Max wait time for graceful shutdown

/* ==================== Database Setup ==================== */
const pool = createPool({
    connectionString: process.env.DATABASE_URL,
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
});

// Global status tracking
global.botStatus = {
    running: false,
    lastRun: null,
    lastRunSuccess: false,
    novelsUpdated: 0,
    novelsChecked: 0,
    nextRun: null,
    errors: [],
    cycleStartTime: null,
    cycleDuration: null
};

// Race condition protection: prevent concurrent execution
let isRunning = false;

// == 'Time-ago- timestamp parser (e.g., "3 days ago") ==
function parseTimeAgo(raw) {
    if (!raw) return null;

    const m = raw.match(/(?:(\d+)|a)\s*(second|minute|hour|day|month|year)s?\s*ago/i);
    if (!m) return null;

    const val = m[1] ? parseInt(m[1], 10) : 1;
    const unit = m[2].toLowerCase();

    const ms = {
        second: 1000,
        minute: 60000,
        hour: 3600000,
        day: 86400000,
        month: 2592000000,
        year: 31536000000,
    }[unit];

    return new Date(Date.now() - val * ms);
}


/* ==================== Scraping Logic ==================== */
async function fetchNovelMainPage(novelUrl) {
    try {
        // Extract base novel URL (remove chapter part)
        const baseUrl = novelUrl.replace(/\/c*chapter-?\d+.*$/, '');

        // Use AbortController for timeout (Node.js fetch doesn't support timeout option)
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

        const response = await fetch(baseUrl, {
            signal: controller.signal,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Connection': 'keep-alive',
            }
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const html = await response.text();
        return html;
    } catch (error) {
        // Error details will be logged by caller with context
        // But we still log here for debugging if needed
        if (error.name === 'AbortError') {
            // Timeout - caller will handle logging
        } else {
            // Other fetch errors - caller will handle logging
        }
        return null;
    }
}

function parseNovelInfoFromHTML(html, novelUrl) {
    try {
        const result = {
            chapter: null,
            genres: [],
            author: null,
            site_latest_chapter_time_raw: null,
            site_latest_chapter_time: null,
        };

        // 1) Best source: .l-chapter
        let match = html.match(
            /<div[^>]*class="[^"]*l-chapter[^"]*"[^>]*>[\s\S]*?Chapter\s+(\d+)\s*[: ]\s*([^<]*)/i
        );

        if (match) {
            result.chapter = {
                num: parseInt(match[1], 10),
                title: match[2].trim()
            };
        } else {
            // 2) Meta tag fallback
            const metaLast = html.match(
                /<meta[^>]+property=["']og:novel:latest_chapter_name["'][^>]+content=["'][^0-9]*([0-9]+)[^"']*["']/i
            );
            if (metaLast) {
                result.chapter = {
                    num: parseInt(metaLast[1], 10),
                    title: null
                };
            }
        }

        // --- Genres & author via <meta> first ---
        const metaGenre = html.match(
            /<meta[^>]+property=["']og:novel:genre["'][^>]+content=["']([^"']+)["']/i
        );
        if (metaGenre) {
            result.genres = metaGenre[1]
                .split(',')
                .map(g => g.trim())
                .filter(g => g.length > 0 && g.length < 50);
        } else {
            const genreMatch = html.match(/<dt[^>]*>Genres?:?\s*<\/dt>\s*<dd[^>]*>([^<]+)<\/dd>/i);
            if (genreMatch) {
                result.genres = genreMatch[1]
                    .split(',')
                    .map(g => g.trim())
                    .filter(g => g.length > 0 && g.length < 50);
            }
        }

        const metaAuthor = html.match(
            /<meta[^>]+property=["']og:novel:author["'][^>]+content=["']([^"']+)["']/i
        );
        if (metaAuthor) {
            result.author = metaAuthor[1].trim().replace(/&quot;/g, '"').replace(/&amp;/g, '&');
        } else {
            const authorMatch =
                html.match(/<dt[^>]*>Author:?\s*<\/dt>\s*<dd[^>]*>([^<]+)<\/dd>/i) ||
                html.match(/Author:\s*([^<,\n]+)/i);
            if (authorMatch) {
                result.author = authorMatch[1].trim().replace(/&quot;/g, '"').replace(/&amp;/g, '&');
            }
        }

        // --- Updated time: prefer .item-time, fallback to og:novel:update_time ---
        const itemTime = html.match(/<div[^>]*class="item-time"[^>]*>([^<]+)<\/div>/i);
        if (itemTime) {
            result.site_latest_chapter_time_raw = itemTime[1].trim();
            const parsed = parseTimeAgo(result.site_latest_chapter_time_raw);
            result.site_latest_chapter_time = parsed ? parsed.toISOString() : null;

        } else {
            const metaUpdate = html.match(
                /<meta[^>]+property=["']og:novel:update_time["'][^>]+content=["']([^"']+)["']/i
            );
            if (metaUpdate) {
                result.site_latest_chapter_time_raw = metaUpdate[1];
                const parsed = new Date(metaUpdate[1]);
                result.site_latest_chapter_time = isNaN(parsed.getTime()) ? null : parsed.toISOString();
            }
        }

        if (!result.chapter) {
            // Logging will be handled by caller with more context
        } else {
            // Log successful parse - this is useful for debugging
            // Note: Full logging with context happens in caller
        }

        return result;
    } catch (error) {
        console.error('Parse error:', error);
        return { chapter: null, genres: [], author: null };
    }
}

/* ==================== Database Operations ==================== */
async function getNovelsNeedingUpdate() {
    const query = `
    SELECT DISTINCT 
      n.id, 
      n.primary_url,
      n.latest_chapter_num,
      n.chapters_updated_at,
      COUNT(DISTINCT p.user_id) as active_readers,
      MAX(p.created_at) as last_read_at
    FROM novels n
    JOIN progress_snapshots p ON p.novel_id = n.id
    WHERE 
      n.primary_url IS NOT NULL
      AND (
        n.chapters_updated_at IS NULL 
        OR n.chapters_updated_at < NOW() - make_interval(hours => $2)
      )
    GROUP BY n.id, n.primary_url, n.latest_chapter_num, n.chapters_updated_at
    ORDER BY active_readers DESC, n.chapters_updated_at ASC NULLS FIRST
    LIMIT $1
  `;

    const result = await pool.query(query, [BATCH_SIZE, STALE_THRESHOLD_HOURS]);
    return result.rows;
}

async function updateNovelChapterInfo(novelId, chapterNum, chapterTitle, genre, author, siteTimeRaw, siteTime) {
    const query = `
        UPDATE novels 
        SET 
            latest_chapter_num = $2,
            latest_chapter_title = $3,
            genre = COALESCE($4, genre),
            author = COALESCE($5, author),
            site_latest_chapter_time_raw = $6,
            site_latest_chapter_time = $7,
            chapters_updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING id, latest_chapter_num, latest_chapter_title, genre, author;
    `;

    const result = await pool.query(query, [novelId, chapterNum, chapterTitle, genre, author, siteTimeRaw, siteTime]);
    return result.rows[0];
}
// Create notifications table if it doesn't exist
async function initNotifications() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS novel_notifications (
            id BIGSERIAL PRIMARY KEY,
            user_id TEXT NOT NULL,
            novel_id TEXT NOT NULL,
            previous_chapter INTEGER,
            new_chapter INTEGER,
            chapter_title TEXT,
            read BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
            FOREIGN KEY (novel_id) REFERENCES novels (id) ON DELETE CASCADE
        )
    `);

    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_notifications_user 
        ON novel_notifications (user_id, read, created_at DESC)
    `);
}

async function createNotificationsForNovelUpdate(novelId, oldChapter, newChapter, chapterTitle) {
    // Find all users who have read this novel
    const usersResult = await pool.query(`
        SELECT DISTINCT user_id 
        FROM progress_snapshots 
        WHERE novel_id = $1
    `, [novelId]);

    for (const { user_id } of usersResult.rows) {
        await pool.query(`
            INSERT INTO novel_notifications 
                (user_id, novel_id, previous_chapter, new_chapter, chapter_title)
            VALUES ($1, $2, $3, $4, $5)
        `, [user_id, novelId, oldChapter, newChapter, chapterTitle]);
    }

    console.log(`   📬 Created notifications for ${usersResult.rows.length} users`);
}

/* ==================== Bot Main Loop ==================== */
// Structured logging helper
function log(level, message, context = {}) {
    const timestamp = new Date().toISOString();
    const logEntry = {
        timestamp,
        level,
        message,
        ...context
    };

    const prefix = {
        info: 'ℹ️',
        warn: '⚠️',
        error: '❌',
        success: '✅'
    }[level] || '📝';

    console.log(`${prefix} [${timestamp}] ${message}`, Object.keys(context).length > 0 ? context : '');
    return logEntry;
}

// Helper function to limit error array size
function addError(error) {
    global.botStatus.errors.push({
        ...error,
        timestamp: new Date().toISOString()
    });
    // Keep only last RETAIN_ERRORS errors if array exceeds MAX_ERRORS
    if (global.botStatus.errors.length > MAX_ERRORS) {
        global.botStatus.errors = global.botStatus.errors.slice(-RETAIN_ERRORS);
    }
}

async function updateNovelChapters() {
    // Race condition protection: prevent concurrent execution
    if (isRunning) {
        log('warn', 'Update cycle already in progress, skipping...');
        return;
    }

    isRunning = true;
    const cycleStartTime = Date.now();
    const cycleId = `cycle-${Date.now()}`;

    log('info', 'Starting chapter update cycle', { cycleId });

    global.botStatus.running = true;
    global.botStatus.lastRun = new Date().toISOString();
    global.botStatus.cycleStartTime = new Date(cycleStartTime).toISOString();
    global.botStatus.novelsUpdated = 0;
    global.botStatus.novelsChecked = 0;
    global.botStatus.errors = [];

    try {
        const novels = await getNovelsNeedingUpdate();

        if (novels.length === 0) {
            log('success', 'All novels up to date!', { cycleId });
            global.botStatus.lastRunSuccess = true;
            global.botStatus.running = false;
            global.botStatus.nextRun = new Date(Date.now() + CHECK_INTERVAL_MS).toISOString();
            return;
        }

        log('info', `Found ${novels.length} novels needing updates`, { cycleId, count: novels.length });

        for (const novel of novels) {
            global.botStatus.novelsChecked++;

            log('info', `Processing novel`, {
                cycleId,
                novelId: novel.id,
                currentChapter: novel.latest_chapter_num || '?',
                activeReaders: novel.active_readers,
                lastCheck: novel.chapters_updated_at || 'Never',
                lastRead: novel.last_read_at || 'Never'
            });

            // Fetch and parse
            const html = await fetchNovelMainPage(novel.primary_url);
            if (!html) {
                log('warn', 'Skipping novel (fetch failed)', { cycleId, novelId: novel.id });
                addError({ novel: novel.id, error: 'Fetch failed', type: 'network', cycleId });
                await sleep(REQUEST_DELAY_MS);
                continue;
            }

            const novelInfo = parseNovelInfoFromHTML(html, novel.primary_url);
            if (!novelInfo.chapter) {
                log('warn', 'Skipping novel (parse failed)', { cycleId, novelId: novel.id });
                addError({ novel: novel.id, error: 'Parse failed', type: 'parse', cycleId });
                await sleep(REQUEST_DELAY_MS);
                continue;
            }

            // Log successful parse with details
            log('info', 'Successfully parsed novel', {
                cycleId,
                novelId: novel.id,
                chapter: novelInfo.chapter.num,
                title: novelInfo.chapter.title,
                genresCount: novelInfo.genres.length,
                hasAuthor: !!novelInfo.author,
                timeRaw: novelInfo.site_latest_chapter_time_raw
            });

            // Check if this is actually new
            if (novel.latest_chapter_num && novelInfo.chapter.num <= novel.latest_chapter_num) {
                log('info', `No new chapters (still at Ch.${novelInfo.chapter.num})`, { cycleId, novelId: novel.id });

                // Update timestamp + metadata even if chapter didn't advance
                await pool.query(`
                UPDATE novels SET 
                    chapters_updated_at = CURRENT_TIMESTAMP,
                    genre = COALESCE($2, genre),            
                    author = COALESCE($3, author),
                    site_latest_chapter_time_raw = $4,
                    site_latest_chapter_time = $5
                WHERE id = $1
            `, [
                    novel.id,
                    novelInfo.genres.join(', ') || null,
                    novelInfo.author,
                    novelInfo.site_latest_chapter_time_raw,
                    novelInfo.site_latest_chapter_time
                ]);

            } else {
                // New chapter found!
                const updated = await updateNovelChapterInfo(
                    novel.id,
                    novelInfo.chapter.num,
                    novelInfo.chapter.title,
                    novelInfo.genres.join(', ') || null,
                    novelInfo.author,
                    novelInfo.site_latest_chapter_time_raw,
                    novelInfo.site_latest_chapter_time
                );

                log('success', `Updated novel`, {
                    cycleId,
                    novelId: novel.id,
                    previousChapter: novel.latest_chapter_num || '?',
                    newChapter: updated.latest_chapter_num,
                    title: updated.latest_chapter_title,
                    genres: novelInfo.genres.length > 0 ? novelInfo.genres.join(', ') : null
                });

                // Create notifications for users
                await createNotificationsForNovelUpdate(
                    novel.id,
                    novel.latest_chapter_num,
                    updated.latest_chapter_num,
                    updated.latest_chapter_title
                );

                global.botStatus.novelsUpdated++;
            }

            // Be nice to servers
            await sleep(REQUEST_DELAY_MS);
        }

        const cycleDuration = Date.now() - cycleStartTime;
        global.botStatus.cycleDuration = cycleDuration;

        log('success', 'Update cycle complete!', {
            cycleId,
            duration: `${(cycleDuration / 1000).toFixed(1)}s`,
            novelsChecked: global.botStatus.novelsChecked,
            novelsUpdated: global.botStatus.novelsUpdated
        });

        global.botStatus.lastRunSuccess = true;

    } catch (error) {
        const cycleDuration = Date.now() - cycleStartTime;
        global.botStatus.cycleDuration = cycleDuration;

        log('error', 'Error in update cycle', {
            cycleId,
            error: error.message,
            stack: error.stack,
            duration: `${(cycleDuration / 1000).toFixed(1)}s`
        });

        global.botStatus.lastRunSuccess = false;
        addError({
            error: error.message,
            stack: error.stack,
            type: 'database',
            cycleId
        });
    } finally {
        global.botStatus.running = false;
        global.botStatus.nextRun = new Date(Date.now() + CHECK_INTERVAL_MS).toISOString();
        isRunning = false;
    }
}

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/* ==================== Manual Trigger Function ==================== */
async function triggerManualUpdate(novelId) {
    try {
        const result = await pool.query(
            'SELECT id, primary_url, latest_chapter_num FROM novels WHERE id = $1',
            [novelId]
        );

        if (result.rows.length === 0) {
            return { error: 'Novel not found' };
        }

        const novel = result.rows[0];
        const html = await fetchNovelMainPage(novel.primary_url);

        if (!html) {
            return { error: 'Failed to fetch novel page' };
        }

        const novelInfo = parseNovelInfoFromHTML(html, novel.primary_url);

        if (!novelInfo.chapter) {
            return { error: 'Failed to parse chapter info' };
        }

        const updated = await updateNovelChapterInfo(
            novel.id,
            novelInfo.chapter.num,
            novelInfo.chapter.title,
            novelInfo.genres.join(', ') || null,
            novelInfo.author,
            novelInfo.site_latest_chapter_time_raw,
            novelInfo.site_latest_chapter_time
        );


        // Create notifications if new chapter
        if (novel.latest_chapter_num && novelInfo.chapter.num > novel.latest_chapter_num) {
            await createNotificationsForNovelUpdate(
                novelId,
                novel.latest_chapter_num,
                updated.latest_chapter_num,
                updated.latest_chapter_title
            );
        }

        return {
            success: true,
            previous: novel.latest_chapter_num,
            current: updated.latest_chapter_num,
            title: updated.latest_chapter_title,
            genres: novelInfo.genres,
            author: updated.author,
            isNew: !novel.latest_chapter_num || novelInfo.chapter.num > novel.latest_chapter_num
        };

    } catch (error) {
        return { error: error.message };
    }
}

/* ==================== Startup ==================== */
async function safeUpdateCycle() {
    try {
        await updateNovelChapters();
    } catch (error) {
        log('error', 'BOT CYCLE CRASHED', {
            error: error.message,
            stack: error.stack
        });
        global.botStatus.lastRunSuccess = false;
        addError({
            error: error.message,
            stack: error.stack,
            type: 'fatal'
        });
        // Don't let it kill the server - just log and continue
    }
}

async function startBot() {
    log('info', 'ReadSync Chapter Update Bot Starting...', {
        checkInterval: `${CHECK_INTERVAL_MS / 1000 / 60} minutes`,
        batchSize: BATCH_SIZE,
        requestDelay: `${REQUEST_DELAY_MS / 1000}s`,
        staleThreshold: `${STALE_THRESHOLD_HOURS} hours`
    });

    // Test database connection
    try {
        await pool.query('SELECT 1');
        log('success', 'Database connected');

        // Initialize notifications table
        await initNotifications();
        log('success', 'Notifications system initialized');
    } catch (error) {
        log('error', 'Database connection failed', { error: error.message });
        process.exit(1);
    }

    // Make functions available globally
    global.updateNovelChapters = safeUpdateCycle;
    global.triggerManualUpdate = triggerManualUpdate;

    // Run immediately on start
    await safeUpdateCycle();

    // Then run on interval
    setInterval(safeUpdateCycle, CHECK_INTERVAL_MS);

    log('success', 'Bot is running! Press Ctrl+C to stop.');
}

// Graceful shutdown
async function gracefulShutdown(signal) {
    log('warn', `Received ${signal}, shutting down bot gracefully...`);

    // Wait for current cycle to finish if running
    if (isRunning) {
        log('info', 'Waiting for current cycle to complete...');
        let waitCount = 0;
        while (isRunning && waitCount < GRACEFUL_SHUTDOWN_WAIT_SECONDS) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            waitCount++;
        }
    }

    try {
        await pool.end();
        log('success', 'Database pool closed, bot shutdown complete');
        process.exit(0);
    } catch (error) {
        log('error', 'Error during shutdown', { error: error.message });
        process.exit(1);
    }
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Export for use as module
module.exports = {
    startBot,
    updateNovelChapters,
    triggerManualUpdate
};

// Run if executed directly
if (require.main === module) {
    startBot().catch(err => {
        console.error('Fatal bot error:', err);
        process.exit(1);
    });
}