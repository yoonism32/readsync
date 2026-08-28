import logger from '../logger.js';
import pool from './pool.js';

export async function initDatabase(): Promise<void> {
  const client = await pool.connect();
  try {
    logger.info('Initializing database schema...');

    await client.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');

    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        api_key TEXT UNIQUE NOT NULL,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMPTZ
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS devices (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        device_label TEXT NOT NULL,
        device_type TEXT DEFAULT 'unknown',
        user_agent TEXT,
        last_seen TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMPTZ,
        active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMPTZ,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS novels (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        primary_url TEXT,
        author TEXT,
        genre TEXT,
        description TEXT,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMPTZ
      )
    `);

    await client.query(`
      ALTER TABLE novels ADD COLUMN IF NOT EXISTS latest_chapter_num INTEGER;
      ALTER TABLE novels ADD COLUMN IF NOT EXISTS latest_chapter_title TEXT;
      ALTER TABLE novels ADD COLUMN IF NOT EXISTS chapters_updated_at TIMESTAMPTZ;
      ALTER TABLE novels ADD COLUMN IF NOT EXISTS site_latest_chapter_time_raw TEXT;
      ALTER TABLE novels ADD COLUMN IF NOT EXISTS site_latest_chapter_time TIMESTAMPTZ;
      ALTER TABLE novels ADD COLUMN IF NOT EXISTS cover_img TEXT;
    `);

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
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMPTZ,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
        FOREIGN KEY (device_id) REFERENCES devices (id) ON DELETE CASCADE,
        FOREIGN KEY (novel_id) REFERENCES novels (id) ON DELETE CASCADE
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS user_novel_meta (
        user_id TEXT NOT NULL,
        novel_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'reading' CHECK (status IN ('reading', 'completed', 'on-hold', 'dropped', 'removed')),
        favorite BOOLEAN DEFAULT FALSE,
        rating INTEGER CHECK (rating >= 1 AND rating <= 5),
        notes TEXT,
        started_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMPTZ,
        completed_at TIMESTAMPTZ,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMPTZ,
        PRIMARY KEY (user_id, novel_id),
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
        FOREIGN KEY (novel_id) REFERENCES novels (id) ON DELETE CASCADE
      )
    `);

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
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMPTZ,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
        FOREIGN KEY (novel_id) REFERENCES novels (id) ON DELETE CASCADE,
        UNIQUE (user_id, novel_id, chapter_url, percent)
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS reading_sessions (
        id BIGSERIAL PRIMARY KEY,
        user_id TEXT NOT NULL,
        novel_id TEXT NOT NULL,
        device_id TEXT NOT NULL,
        session_type TEXT DEFAULT 'manual' CHECK (session_type IN ('auto', 'manual', 'imported')),
        start_time TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMPTZ,
        end_time TIMESTAMPTZ,
        start_percent NUMERIC(5,2) CHECK (start_percent >= 0 AND start_percent <= 100),
        end_percent NUMERIC(5,2) CHECK (end_percent >= 0 AND end_percent <= 100),
        time_spent_seconds INTEGER DEFAULT 0 CHECK (time_spent_seconds >= 0),
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMPTZ,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
        FOREIGN KEY (novel_id) REFERENCES novels (id) ON DELETE CASCADE,
        FOREIGN KEY (device_id) REFERENCES devices (id) ON DELETE CASCADE
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS novel_notes (
        id BIGSERIAL PRIMARY KEY,
        user_id TEXT NOT NULL,
        novel_id TEXT NOT NULL,
        note_text TEXT NOT NULL,
        chapter_num INTEGER,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMPTZ,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMPTZ,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
        FOREIGN KEY (novel_id) REFERENCES novels (id) ON DELETE CASCADE
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS user_settings (
        user_id TEXT NOT NULL,
        key TEXT NOT NULL,
        value TEXT,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMPTZ,
        PRIMARY KEY (user_id, key),
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS novel_categories (
        user_id TEXT NOT NULL,
        novel_id TEXT NOT NULL,
        category TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMPTZ,
        PRIMARY KEY (user_id, novel_id, category),
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
        FOREIGN KEY (novel_id) REFERENCES novels (id) ON DELETE CASCADE
      )
    `);

    // Add reread support columns
    await client.query(`
      ALTER TABLE user_novel_meta ADD COLUMN IF NOT EXISTS current_read_through INTEGER DEFAULT 1;
      ALTER TABLE user_novel_meta ADD COLUMN IF NOT EXISTS read_history JSONB DEFAULT '[]'::jsonb;
      ALTER TABLE user_novel_meta ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
      ALTER TABLE progress_snapshots ADD COLUMN IF NOT EXISTS read_through_num INTEGER DEFAULT 1;
    `);

    // Performance indexes
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_progress_user_novel ON progress_snapshots (user_id, novel_id, created_at DESC)',
      'CREATE INDEX IF NOT EXISTS idx_progress_device ON progress_snapshots (device_id, novel_id, created_at DESC)',
      'CREATE INDEX IF NOT EXISTS idx_progress_created_at ON progress_snapshots (created_at DESC)',
      'CREATE INDEX IF NOT EXISTS idx_bookmarks_user_novel ON bookmarks (user_id, novel_id, created_at DESC)',
      'CREATE INDEX IF NOT EXISTS idx_sessions_user ON reading_sessions (user_id, start_time DESC)',
      'CREATE INDEX IF NOT EXISTS idx_sessions_novel ON reading_sessions (novel_id, start_time DESC)',
      'CREATE INDEX IF NOT EXISTS idx_devices_user_active ON devices (user_id, active, last_seen DESC)',
      'CREATE INDEX IF NOT EXISTS idx_user_novel_meta_status ON user_novel_meta (user_id, status, updated_at DESC)',
      'CREATE INDEX IF NOT EXISTS idx_novel_notes_user_novel ON novel_notes (user_id, novel_id, created_at DESC)',
      'CREATE INDEX IF NOT EXISTS idx_novel_categories_user ON novel_categories (user_id, category)',
      'CREATE INDEX IF NOT EXISTS idx_progress_read_through ON progress_snapshots (user_id, novel_id, read_through_num, created_at DESC)',
      'CREATE INDEX IF NOT EXISTS idx_sessions_device ON reading_sessions (device_id, start_time DESC)',
    ];

    for (const sql of indexes) {
      try {
        await client.query(sql);
      } catch (err: unknown) {
        logger.debug({ sql, err }, 'Index already exists or error (non-fatal)');
      }
    }

    // Demo user (development only)
    await client.query(`
      INSERT INTO users (id, display_name, api_key)
      VALUES ('demo-user', 'Demo User', 'demo-api-key-12345')
      ON CONFLICT (id) DO UPDATE SET
        display_name = EXCLUDED.display_name,
        api_key = EXCLUDED.api_key
    `);

    logger.info('Database schema initialized');
  } catch (error) {
    logger.error({ error }, 'Database initialization failed');
    throw error;
  } finally {
    client.release();
  }
}
