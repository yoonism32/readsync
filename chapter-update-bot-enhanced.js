const { createPool } = require('./db-utils');
const puppeteerCore = require('puppeteer-core');
const chromium = require('@sparticuz/chromium');

/* ==================== Configuration ==================== */
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours between full cycles
const BATCH_SIZE = 5; // Check 5 novels at a time
const BATCH_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes between batches
const STALE_THRESHOLD_HOURS = 24; // Update if not checked in 24 hours

// Error management constants
const MAX_ERRORS = 100;
const RETAIN_ERRORS = 50;

// Timeout constants
const BROWSER_TIMEOUT_MS = 30000; // 30 seconds timeout for browser operations
const CLOUDFLARE_WAIT_MS = 5000; // 5 seconds wait for Cloudflare challenge
const GRACEFUL_SHUTDOWN_WAIT_SECONDS = 60;

/* ==================== PUPPETEER BROWSER MANAGEMENT ==================== */
let browserInstance = null;
let browserLaunchInProgress = false;

async function getBrowser() {
    // If already launching, wait for it
    while (browserLaunchInProgress) {
        await sleep(100);
    }

    // Return existing instance if available
    if (browserInstance && browserInstance.isConnected()) {
        return browserInstance;
    }

    // Launch new browser
    browserLaunchInProgress = true;
    try {
        console.log('🚀 Launching Puppeteer browser with Chromium...');
        browserInstance = await puppeteerCore.launch({
            args: chromium.args,
            defaultViewport: chromium.defaultViewport,
            executablePath: await chromium.executablePath(),
            headless: chromium.headless,
        });
        console.log('✅ Browser launched successfully');
        return browserInstance;
    } catch (error) {
        console.error('❌ Failed to launch browser:', error);
        browserInstance = null;
        throw error;
    } finally {
        browserLaunchInProgress = false;
    }
}

async function closeBrowser() {
    if (browserInstance) {
        try {
            await browserInstance.close();
            console.log('🔒 Browser closed');
        } catch (error) {
            console.error('Error closing browser:', error);
        }
        browserInstance = null;
    }
}

/* ==================== GLOBAL SCRAPE THROTTLE ==================== */
let lastNovelbinRequestAt = 0;
let novelbinBlockedUntil = 0;

const MIN_GLOBAL_GAP_MS = 10_000; // 10 seconds between requests
const COOLDOWN_403_MS = 6 * 60 * 60 * 1000; // 6 hours hard block on 403
const COOLDOWN_429_MS = 30 * 60 * 1000; // 30 min cooldown on 429

let singleRunLock = false;

async function waitForGlobalScrapeSlot() {
    const now = Date.now();

    if (now < novelbinBlockedUntil) {
        const waitLeft = Math.ceil((novelbinBlockedUntil - now) / 1000);
        throw new Error(`NovelBin globally blocked for ${waitLeft}s`);
    }

    const gap = now - lastNovelbinRequestAt;
    if (gap < MIN_GLOBAL_GAP_MS) {
        const waitTime = MIN_GLOBAL_GAP_MS - gap;
        console.log(`⏳ Waiting ${Math.ceil(waitTime / 1000)}s before next request...`);
        await sleep(waitTime);
    }

    lastNovelbinRequestAt = Date.now();
}

/* ==================== Database Setup ==================== */
const pool = createPool({
    connectionString: process.env.DATABASE_URL,
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
});

/* ==================== Helper Functions ==================== */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/* ==================== Scraping Logic with Puppeteer ==================== */
async function fetchNovelMainPage(novelUrl) {
    await waitForGlobalScrapeSlot();

    let page = null;
    try {
        // Extract base novel URL (remove chapter part)
        const baseUrl = novelUrl.replace(/\/c*chapter-?\d+.*$/, '');

        // Get browser instance
        const browser = await getBrowser();
        // Create new page
        page = await browser.newPage();
        // Set realistic viewport
        await page.setViewport({ width: 1920, height: 1080 });
        // Set user agent
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        console.log(`🌐 Navigating to: ${baseUrl}`);
        // Navigate to page with timeout
        await page.goto(baseUrl, {
            waitUntil: 'networkidle0',
            timeout: BROWSER_TIMEOUT_MS
        });

        // Wait for Cloudflare challenge to complete
        console.log('⏳ Waiting for Cloudflare challenge...');
        await page.waitForTimeout(CLOUDFLARE_WAIT_MS);

        // Get HTML content
        const html = await page.content();
        console.log('✅ Page fetched successfully');
        return html;

    } catch (error) {
        console.error('❌ Browser fetch failed:', error.message);

        // Handle specific error codes
        if (error.message.includes('403')) {
            console.error('🚫 Got 403 - setting cooldown');
            novelbinBlockedUntil = Date.now() + COOLDOWN_403_MS;
        } else if (error.message.includes('429')) {
            console.error('⏸️  Got 429 - setting cooldown');
            novelbinBlockedUntil = Date.now() + COOLDOWN_429_MS;
        }

        // If browser crashed, clear the instance
        if (error.message.includes('Target closed') || error.message.includes('Session closed')) {
            browserInstance = null;
        }

        throw error;
    } finally {
        // Always close the page (not the browser)
        if (page) {
            try {
                await page.close();
            } catch (e) {
                console.error('Error closing page:', e.message);
            }
        }
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
            const metaUpdateTime = html.match(
                /<meta[^>]+property=["']og:novel:update_time["'][^>]+content=["']([^"']+)["']/i
            );
            if (metaUpdateTime) {
                result.site_latest_chapter_time_raw = metaUpdateTime[1].trim();
                const parsedDate = new Date(result.site_latest_chapter_time_raw);
                result.site_latest_chapter_time = !isNaN(parsedDate) ? parsedDate.toISOString() : null;
            }
        }

        return result;
    } catch (err) {
        console.error('HTML parsing error:', err);
        return {
            chapter: null,
            genres: [],
            author: null,
            site_latest_chapter_time_raw: null,
            site_latest_chapter_time: null
        };
    }
}

function parseTimeAgo(str) {
    if (!str) return null;
    str = str.toLowerCase().trim();

    const now = new Date();

    if (/just now|a few (seconds|secs) ago/i.test(str)) {
        return now;
    }

    let match = str.match(/(\d+)\s*(second|sec|minute|min|hour|day|week|month|year)s?\s*ago/i);
    if (!match) return null;

    const val = parseInt(match[1], 10);
    const unit = match[2].toLowerCase();

    const ms = {
        second: 1000, sec: 1000, minute: 60000, min: 60000,
        hour: 3600000, day: 86400000, week: 604800000,
        month: 2592000000, year: 31536000000
    };

    if (!ms[unit]) return null;

    return new Date(now.getTime() - val * ms[unit]);
}

/* ==================== Database Operations ==================== */
async function initNotifications() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS notifications (
            id SERIAL PRIMARY KEY,
            user_id TEXT NOT NULL,
            novel_id TEXT NOT NULL,
            type TEXT NOT NULL,
            message TEXT NOT NULL,
            read BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
            FOREIGN KEY (novel_id) REFERENCES novels (id) ON DELETE CASCADE
        )
    `);

    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_notifications_user_unread 
        ON notifications (user_id, read, created_at DESC)
    `);
}

async function getNovelsNeedingUpdate() {
    const staleHoursAgo = new Date(Date.now() - STALE_THRESHOLD_HOURS * 60 * 60 * 1000).toISOString();

    const result = await pool.query(`
        SELECT DISTINCT n.id, n.primary_url, n.latest_chapter_num, n.chapters_updated_at,
               (SELECT MAX(updated_at) FROM progress_snapshots WHERE novel_id = n.id) as last_read_at,
               (SELECT COUNT(DISTINCT device_id) FROM progress_snapshots WHERE novel_id = n.id) as active_readers
        FROM novels n
        WHERE n.primary_url IS NOT NULL
          AND (n.chapters_updated_at IS NULL OR n.chapters_updated_at < $1)
        ORDER BY 
          (SELECT COUNT(DISTINCT device_id) FROM progress_snapshots WHERE novel_id = n.id) DESC,
          n.chapters_updated_at ASC NULLS FIRST
    `, [staleHoursAgo]);

    return result.rows;
}

async function updateNovelChapterInfo(novelId, chapterNum, chapterTitle, genres, author, timeRaw, timeISO) {
    const result = await pool.query(`
        UPDATE novels 
        SET latest_chapter_num = $2,
            latest_chapter_title = $3,
            chapters_updated_at = CURRENT_TIMESTAMP,
            genre = COALESCE($4, genre),
            author = COALESCE($5, author),
            site_latest_chapter_time_raw = $6,
            site_latest_chapter_time = $7
        WHERE id = $1
        RETURNING *
    `, [novelId, chapterNum, chapterTitle, genres, author, timeRaw, timeISO]);

    return result.rows[0];
}

/* ==================== Single Novel Test Function ==================== */
async function runSingleNovelOnly(novelId) {
    if (singleRunLock) {
        return { error: 'Single-novel run already in progress' };
    }

    singleRunLock = true;
    console.log(`🧪 SINGLE-NOVEL MODE: Running ${novelId}`);

    try {
        const result = await pool.query(
            'SELECT id, primary_url, latest_chapter_num FROM novels WHERE id = $1',
            [novelId]
        );

        if (result.rows.length === 0) {
            return { error: 'Novel not found' };
        }

        const novel = result.rows[0];

        if (!novel.primary_url) {
            return { error: 'Novel has no URL' };
        }

        const html = await fetchNovelMainPage(novel.primary_url);
        const novelInfo = parseNovelInfoFromHTML(html, novel.primary_url);

        if (!novelInfo.chapter) {
            return { error: 'Failed to parse chapter' };
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

        console.log(`✅ SINGLE-NOVEL SUCCESS: ${novel.id} → Ch.${updated.latest_chapter_num}`);

        return {
            success: true,
            previous: novel.latest_chapter_num,
            current: updated.latest_chapter_num,
            title: updated.latest_chapter_title
        };

    } catch (err) {
        console.error(`❌ SINGLE-NOVEL FAILED:`, err.message);
        return { error: err.message };
    } finally {
        singleRunLock = false;
    }
}

/* ==================== Bot Main Loop ==================== */
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

    if (global.botStatus && Array.isArray(global.botStatus.errors)) {
        if (level === 'error' || level === 'warn') {
            addError(logEntry);
        }
    }
}

function addError(error) {
    if (!global.botStatus) return;

    global.botStatus.errors.push({
        ...error,
        timestamp: new Date().toISOString()
    });

    if (global.botStatus.errors.length > MAX_ERRORS) {
        global.botStatus.errors = global.botStatus.errors.slice(-RETAIN_ERRORS);
    }
}

let isRunning = false;

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

async function updateNovelChapters() {
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

        // Process in batches
        for (let i = 0; i < novels.length; i += BATCH_SIZE) {
            const batch = novels.slice(i, i + BATCH_SIZE);
            const batchNum = Math.floor(i / BATCH_SIZE) + 1;
            const totalBatches = Math.ceil(novels.length / BATCH_SIZE);

            log('info', `Processing batch ${batchNum}/${totalBatches}`, {
                cycleId,
                batchSize: batch.length,
                progress: `${i + batch.length}/${novels.length}`
            });

            for (const novel of batch) {
                global.botStatus.novelsChecked++;

                log('info', `Processing novel`, {
                    cycleId,
                    novelId: novel.id,
                    currentChapter: novel.latest_chapter_num || '?',
                    activeReaders: novel.active_readers,
                    lastCheck: novel.chapters_updated_at || 'Never',
                    lastRead: novel.last_read_at || 'Never'
                });

                try {
                    const html = await fetchNovelMainPage(novel.primary_url);

                    const novelInfo = parseNovelInfoFromHTML(html, novel.primary_url);
                    if (!novelInfo.chapter) {
                        log('warn', 'Skipping novel (parse failed)', { cycleId, novelId: novel.id });
                        addError({ novel: novel.id, error: 'Parse failed', type: 'parse', cycleId });
                        continue;
                    }

                    log('info', 'Successfully parsed novel', {
                        cycleId,
                        novelId: novel.id,
                        chapter: novelInfo.chapter.num,
                        title: novelInfo.chapter.title,
                        genresCount: novelInfo.genres.length,
                        hasAuthor: !!novelInfo.author,
                        timeRaw: novelInfo.site_latest_chapter_time_raw
                    });

                    if (novel.latest_chapter_num && novelInfo.chapter.num <= novel.latest_chapter_num) {
                        log('info', `No new chapters (still at Ch.${novelInfo.chapter.num})`, { cycleId, novelId: novel.id });

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

                        global.botStatus.novelsUpdated++;
                    }
                } catch (error) {
                    log('error', 'Novel processing failed', {
                        cycleId,
                        novelId: novel.id,
                        error: error.message
                    });
                    addError({
                        novel: novel.id,
                        error: error.message,
                        type: 'fetch',
                        cycleId
                    });
                }
            }

            // Wait between batches (except for the last batch)
            if (i + BATCH_SIZE < novels.length) {
                const waitMinutes = BATCH_INTERVAL_MS / 60000;
                log('info', `Waiting ${waitMinutes} minutes before next batch...`, { cycleId });
                await sleep(BATCH_INTERVAL_MS);
            }
        }

        const cycleDuration = Date.now() - cycleStartTime;
        global.botStatus.cycleDuration = `${Math.floor(cycleDuration / 1000)}s`;
        global.botStatus.lastRunSuccess = true;
        global.botStatus.nextRun = new Date(Date.now() + CHECK_INTERVAL_MS).toISOString();

        log('success', 'Update cycle completed', {
            cycleId,
            duration: global.botStatus.cycleDuration,
            checked: global.botStatus.novelsChecked,
            updated: global.botStatus.novelsUpdated
        });

        // Close browser after cycle completes to save memory
        await closeBrowser();

    } catch (error) {
        log('error', 'Update cycle failed', {
            error: error.message,
            stack: error.stack
        });
        global.botStatus.lastRunSuccess = false;
        addError({
            error: error.message,
            stack: error.stack,
            type: 'fatal'
        });
    } finally {
        isRunning = false;
        global.botStatus.running = false;
    }
}

async function triggerManualUpdate() {
    log('info', 'Manual update triggered');
    setImmediate(() => updateNovelChapters());
}

async function safeUpdateCycle() {
    try {
        await updateNovelChapters();
    } catch (error) {
        log('error', 'Critical error in update cycle', {
            error: error.message,
            stack: error.stack
        });
        global.botStatus.lastRunSuccess = false;
        addError({
            error: error.message,
            stack: error.stack,
            type: 'fatal'
        });
    }
}

async function startBot() {
    log('info', 'ReadSync Chapter Update Bot Starting (PUPPETEER-CORE + CHROMIUM)...', {
        checkInterval: `${CHECK_INTERVAL_MS / 1000 / 60} minutes`,
        batchSize: BATCH_SIZE,
        batchInterval: `${BATCH_INTERVAL_MS / 1000 / 60} minutes`,
        staleThreshold: `${STALE_THRESHOLD_HOURS} hours`
    });

    try {
        await pool.query('SELECT 1');
        log('success', 'Database connected');

        await initNotifications();
        log('success', 'Notifications system initialized');
    } catch (error) {
        log('error', 'Database connection failed', { error: error.message });
        process.exit(1);
    }

    // Make functions available globally
    global.updateNovelChapters = safeUpdateCycle;
    global.triggerManualUpdate = triggerManualUpdate;
    global.runSingleNovelOnly = runSingleNovelOnly;

    // ✅ AUTO-BOT DISABLED - Uncomment these lines to enable automatic updates
    // await safeUpdateCycle();
    // setInterval(safeUpdateCycle, CHECK_INTERVAL_MS);

    log('success', 'Bot is running! Use diagnostic mode or enable auto-updates.');
}

async function gracefulShutdown(signal) {
    log('warn', `Received ${signal}, shutting down bot gracefully...`);

    if (isRunning) {
        log('info', `Waiting up to ${GRACEFUL_SHUTDOWN_WAIT_SECONDS}s for current cycle to finish...`);

        const deadline = Date.now() + (GRACEFUL_SHUTDOWN_WAIT_SECONDS * 1000);
        while (isRunning && Date.now() < deadline) {
            await sleep(1000);
        }

        if (isRunning) {
            log('warn', 'Forcing shutdown - cycle incomplete');
        }
    }

    // Close browser
    await closeBrowser();

    // Close database
    try {
        await pool.end();
        log('success', 'Database connection closed');
    } catch (error) {
        log('error', 'Error closing database', { error: error.message });
    }

    log('success', 'Bot shutdown complete');
    process.exit(0);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

module.exports = {
    startBot,
    updateNovelChapters,
    triggerManualUpdate,
    runSingleNovelOnly
};

if (require.main === module) {
    startBot().catch(err => {
        console.error('Fatal bot error:', err);
        process.exit(1);
    });
}