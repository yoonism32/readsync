// chapter-update-bot.js - Automatic Chapter Update Bot with Genre Detection
const { Pool } = require('pg');
const { URL } = require('url');

/* ==================== Configuration ==================== */
const CHECK_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes
const BATCH_SIZE = 10; // Check 10 novels at a time
const REQUEST_DELAY_MS = 2000; // 2s delay between requests (be nice to servers)
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

/* ==================== Scraping Logic ==================== */
async function fetchNovelMainPage(novelUrl) {
    try {
        // Extract base novel URL (remove chapter part)
        const baseUrl = novelUrl.replace(/\/c*chapter-\d+.*$/, '');

        console.log(`📖 Fetching novel page: ${baseUrl}`);

        const response = await fetch(baseUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
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
        const result = { chapter: null, genres: [], author: null };

        // === Parse Latest Chapter ===
        // Strategy 1: Find .l-chapter structure (NovelBin specific)
        let match = html.match(/<div[^>]*class="[^"]*l-chapter[^"]*"[^>]*>[\s\S]*?Chapter\s+(\d+)\s*:\s*([^<]+)/i);
        if (match) {
            result.chapter = {
                num: parseInt(match[1], 10),
                title: match[2].trim()
            };
        } else {
            // Strategy 2: Find all chapter links and get the highest number
            const chapterRegex = /chapter-(\d+)/gi;
            const matches = [...html.matchAll(chapterRegex)];

            if (matches.length > 0) {
                const maxChapter = Math.max(...matches.map(m => parseInt(m[1], 10)));

                // Try to find title for this chapter
                const titlePattern = new RegExp(`Chapter\\s+${maxChapter}\\s*:\\s*([^<>"]+)`, 'i');
                const titleMatch = html.match(titlePattern);

                result.chapter = {
                    num: maxChapter,
                    title: titleMatch ? titleMatch[1].trim() : null
                };
            } else {
                // Strategy 3: Look for "latest chapter" text
                match = html.match(/latest[^>]*chapter[^>]*?:\s*Chapter\s+(\d+)/i);
                if (match) {
                    result.chapter = {
                        num: parseInt(match[1], 10),
                        title: null
                    };
                }
            }
        }

        // === Parse Genres (NovelBin shows them on the page!) ===
        // Look for: <dt>Genres:</dt><dd>Action, Adventure, Fantasy</dd>
        const genreMatch = html.match(/<dt[^>]*>Genres?:?\s*<\/dt>\s*<dd[^>]*>([^<]+)<\/dd>/i);
        if (genreMatch) {
            result.genres = genreMatch[1]
                .split(',')
                .map(g => g.trim())
                .filter(g => g.length > 0);
        }

        // === Parse Author ===
        const authorMatch = html.match(/<dt[^>]*>Author:?\s*<\/dt>\s*<dd[^>]*>([^<]+)<\/dd>/i) ||
            html.match(/Author:\s*([^<,\n]+)/i);
        if (authorMatch) {
            result.author = authorMatch[1].trim();
        }

        if (!result.chapter) {
            console.log(`⚠️ Could not parse chapter from ${novelUrl}`);
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
      COUNT(DISTINCT p.user_id) as active_readers
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

async function updateNovelChapterInfo(novelId, chapterNum, chapterTitle, genre, author) {
    const query = `
    UPDATE novels 
    SET 
      latest_chapter_num = $2,
      latest_chapter_title = $3,
      genre = COALESCE($4, genre),
      author = COALESCE($5, author),
      chapters_updated_at = CURRENT_TIMESTAMP
    WHERE id = $1
    RETURNING id, latest_chapter_num, latest_chapter_title, genre, author
  `;

    const result = await pool.query(query, [novelId, chapterNum, chapterTitle, genre, author]);
    return result.rows[0];
}

/* ==================== Bot Main Loop ==================== */
async function updateNovelChapters() {
    console.log('\n🤖 Starting chapter update cycle...');

    try {
        const novels = await getNovelsNeedingUpdate();

        if (novels.length === 0) {
            console.log('✅ All novels up to date!');
            return;
        }

        console.log(`📚 Found ${novels.length} novels needing updates`);

        for (const novel of novels) {
            console.log(`\n📖 Processing: ${novel.id}`);
            console.log(`   Current: Ch.${novel.latest_chapter_num || '?'}`);
            console.log(`   Readers: ${novel.active_readers}`);
            console.log(`   Last check: ${novel.chapters_updated_at || 'Never'}`);

            // Fetch and parse
            const html = await fetchNovelMainPage(novel.primary_url);
            if (!html) {
                console.log('   ⏭️ Skipping (fetch failed)');
                await sleep(REQUEST_DELAY_MS);
                continue;
            }

            const novelInfo = parseNovelInfoFromHTML(html, novel.primary_url);
            if (!novelInfo.chapter) {
                console.log('   ⏭️ Skipping (parse failed)');
                await sleep(REQUEST_DELAY_MS);
                continue;
            }

            // Check if this is actually new
            if (novel.latest_chapter_num && novelInfo.chapter.num <= novel.latest_chapter_num) {
                console.log(`   ℹ️ No new chapters (still at Ch.${novelInfo.chapter.num})`);

                // Update timestamp and other info even if no new chapters
                await pool.query(`
          UPDATE novels SET 
            chapters_updated_at = CURRENT_TIMESTAMP,
            genre = COALESCE($2, genre),
            author = COALESCE($3, author)
          WHERE id = $1
        `, [novel.id, novelInfo.genres.join(', ') || null, novelInfo.author]);
            } else {
                // New chapter found!
                const updated = await updateNovelChapterInfo(
                    novel.id,
                    novelInfo.chapter.num,
                    novelInfo.chapter.title,
                    novelInfo.genres.join(', ') || null,
                    novelInfo.author
                );

                console.log(`   🎉 Updated! Ch.${novel.latest_chapter_num || '?'} → Ch.${updated.latest_chapter_num}`);
                if (updated.latest_chapter_title) {
                    console.log(`   📝 Title: ${updated.latest_chapter_title}`);
                }
                if (novelInfo.genres.length > 0) {
                    console.log(`   🏷️ Genres: ${novelInfo.genres.join(', ')}`);
                }
            }

            // Be nice to servers
            await sleep(REQUEST_DELAY_MS);
        }

        console.log('\n✅ Update cycle complete!');

    } catch (error) {
        console.error('❌ Error in update cycle:', error);
    }
}

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/* ==================== Manual Trigger Endpoint ==================== */
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
            novelId,
            novelInfo.chapter.num,
            novelInfo.chapter.title,
            novelInfo.genres.join(', ') || null,
            novelInfo.author
        );

        return {
            success: true,
            previous: novel.latest_chapter_num,
            current: updated.latest_chapter_num,
            title: updated.latest_chapter_title,
            genres: novelInfo.genres,
            author: updated.author
        };

    } catch (error) {
        return { error: error.message };
    }
}

/* ==================== Startup ==================== */
async function startBot() {
    console.log('🤖 ReadSync Chapter Update Bot Starting...');
    console.log(`⏰ Check interval: ${CHECK_INTERVAL_MS / 1000 / 60} minutes`);
    console.log(`📦 Batch size: ${BATCH_SIZE} novels`);
    console.log(`⏱️ Request delay: ${REQUEST_DELAY_MS / 1000}s`);
    console.log(`📅 Stale threshold: ${STALE_THRESHOLD_HOURS} hours\n`);

    // Test database connection
    try {
        await pool.query('SELECT 1');
        console.log('✅ Database connected\n');
    } catch (error) {
        console.error('❌ Database connection failed:', error);
        process.exit(1);
    }

    // Run immediately on start
    await updateNovelChapters();

    // Then run on interval
    setInterval(updateNovelChapters, CHECK_INTERVAL_MS);

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
    startBot();
}