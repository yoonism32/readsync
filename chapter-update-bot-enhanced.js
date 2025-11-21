const { Pool } = require('pg');
const { URL } = require('url');

/* ==================== Configuration ==================== */
const CHECK_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes
const BATCH_SIZE = 5; // Check 10 novels at a time
const REQUEST_DELAY_MS = 5000; // 2s delay between requests (be nice to servers)
const STALE_THRESHOLD_HOURS = 24; // Update if not checked in 24 hours

/* ==================== Database Setup ==================== */
function forceNoVerify(dbUrl) {
    try {
        const u = new URL(dbUrl);
        u.searchParams.set('sslmode', 'no-verify');
        return u.toString();
    } catch {
        if (/sslmode=/.test(dbUrl)) return dbUrl.replace(/sslmode=[^&]+/i, 'sslmode=no-verify');
        return dbUrl + (dbUrl.includes('?') ? '&' : '?') + 'sslmode=no-verify';
    }
}

const connectionString = forceNoVerify(process.env.DATABASE_URL);

const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
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
    errors: []
};

// == 'Time-ago- timestamp parser (e.g., "3 days ago") ==
function parseTimeAgo(raw) {
    if (!raw) return null;

    const m = raw.match(/(\d+)\s*(second|minute|hour|day|month|year)s?\s*ago/i);
    if (!m) return null;

    const val = parseInt(m[1], 10);
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

        console.log(`📖 Fetching novel page: ${baseUrl}`);

        const response = await fetch(baseUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Connection': 'keep-alive',
            },
            timeout: 10000
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const html = await response.text();
        return html;
    } catch (error) {
        console.error(`❌ Failed to fetch ${novelUrl}:`, error.message);
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
            result.site_latest_chapter_time = parseTimeAgo(
                result.site_latest_chapter_time_raw
            );
        } else {
            const metaUpdate = html.match(
                /<meta[^>]+property=["']og:novel:update_time["'][^>]+content=["']([^"']+)["']/i
            );
            if (metaUpdate) {
                result.site_latest_chapter_time_raw = metaUpdate[1];
                const parsed = new Date(metaUpdate[1]);
                result.site_latest_chapter_time = isNaN(parsed.getTime()) ? null : parsed;
            }
        }

        if (!result.chapter) {
            console.log(`⚠️ Could not parse chapter from ${novelUrl}`);
        } else {
            console.log(`📖 Successfully parsed ${novelUrl}:`, {
                chapter: result.chapter.num,
                title: result.chapter.title,
                genres: result.genres.length,
                author: result.author ? 'yes' : 'no',
                time: result.site_latest_chapter_time_raw
            });
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
        OR n.chapters_updated_at < NOW() - INTERVAL '${STALE_THRESHOLD_HOURS} hours'
      )
    GROUP BY n.id, n.primary_url, n.latest_chapter_num, n.chapters_updated_at
    ORDER BY active_readers DESC, n.chapters_updated_at ASC NULLS FIRST
    LIMIT $1
  `;

    const result = await pool.query(query, [BATCH_SIZE]);
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
async function updateNovelChapters() {
    console.log('\n🤖 Starting chapter update cycle...');

    global.botStatus.running = true;
    global.botStatus.lastRun = new Date().toISOString();
    global.botStatus.novelsUpdated = 0;
    global.botStatus.novelsChecked = 0;
    global.botStatus.errors = [];

    try {
        const novels = await getNovelsNeedingUpdate();

        if (novels.length === 0) {
            console.log('✅ All novels up to date!');
            global.botStatus.lastRunSuccess = true;
            global.botStatus.running = false;
            global.botStatus.nextRun = new Date(Date.now() + CHECK_INTERVAL_MS).toISOString();
            return;
        }

        console.log(`📚 Found ${novels.length} novels needing updates`);

        for (const novel of novels) {
            global.botStatus.novelsChecked++;

            console.log(`\n📖 Processing: ${novel.id}`);
            console.log(`   Current: Ch.${novel.latest_chapter_num || '?'}`);
            console.log(`   Readers: ${novel.active_readers}`);
            console.log(`   Last check: ${novel.chapters_updated_at || 'Never'}`);
            console.log(`   Last read: ${novel.last_read_at || 'Never'}`);

            // Fetch and parse
            const html = await fetchNovelMainPage(novel.primary_url);
            if (!html) {
                console.log('   ⏭️ Skipping (fetch failed)');
                global.botStatus.errors.push({ novel: novel.id, error: 'Fetch failed' });
                await sleep(REQUEST_DELAY_MS);
                continue;
            }

            const novelInfo = parseNovelInfoFromHTML(html, novel.primary_url);
            if (!novelInfo.chapter) {
                console.log('   ⏭️ Skipping (parse failed)');
                global.botStatus.errors.push({ novel: novel.id, error: 'Parse failed' });
                await sleep(REQUEST_DELAY_MS);
                continue;
            }

            // Check if this is actually new
            if (novel.latest_chapter_num && novelInfo.chapter.num <= novel.latest_chapter_num) {
                console.log(`   ℹ️ No new chapters (still at Ch.${novelInfo.chapter.num})`);

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

                console.log(`   🎉 Updated! Ch.${novel.latest_chapter_num || '?'} → Ch.${updated.latest_chapter_num}`);
                if (updated.latest_chapter_title) {
                    console.log(`   📝 Title: ${updated.latest_chapter_title}`);
                }
                if (novelInfo.genres.length > 0) {
                    console.log(`   🏷️ Genres: ${novelInfo.genres.join(', ')}`);
                }

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

        console.log('\n✅ Update cycle complete!');
        console.log(`📊 Stats: ${global.botStatus.novelsChecked} checked, ${global.botStatus.novelsUpdated} updated`);

        global.botStatus.lastRunSuccess = true;

    } catch (error) {
        console.error('❌ Error in update cycle:', error);
        global.botStatus.lastRunSuccess = false;
        global.botStatus.errors.push({ error: error.message });
    } finally {
        global.botStatus.running = false;
        global.botStatus.nextRun = new Date(Date.now() + CHECK_INTERVAL_MS).toISOString();
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
        console.error('🔴 BOT CYCLE CRASHED:', error);
        console.error('Stack:', error.stack);
        global.botStatus.lastRunSuccess = false;
        global.botStatus.errors.push({
            timestamp: new Date().toISOString(),
            error: error.message
        });
        // Don't let it kill the server - just log and continue
    }
}

async function startBot() {
    console.log('🤖 ReadSync Chapter Update Bot Starting...');
    console.log(`⏰ Check interval: ${CHECK_INTERVAL_MS / 1000 / 60} minutes`);
    console.log(`📦 Batch size: ${BATCH_SIZE} novels`);
    console.log(`⏱️ Request delay: ${REQUEST_DELAY_MS / 1000}s`);
    console.log(`📅 Stale threshold: ${STALE_THRESHOLD_HOURS} hours\n`);

    // Test database connection
    try {
        await pool.query('SELECT 1');
        console.log('✅ Database connected');

        // Initialize notifications table
        await initNotifications();
        console.log('✅ Notifications system initialized\n');
    } catch (error) {
        console.error('❌ Database connection failed:', error);
        process.exit(1);
    }

    // Make functions available globally
    global.updateNovelChapters = safeUpdateCycle;
    global.triggerManualUpdate = triggerManualUpdate;

    // Run immediately on start
    await safeUpdateCycle();

    // Then run on interval
    setInterval(safeUpdateCycle, CHECK_INTERVAL_MS);

    console.log('\n✅ Bot is running! Press Ctrl+C to stop.\n');
}

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('\n🛑 Shutting down bot...');
    await pool.end();
    process.exit(0);
});

process.on('SIGINT', async () => {
    console.log('\n🛑 Shutting down bot...');
    await pool.end();
    process.exit(0);
});

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