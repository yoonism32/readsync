-- Initial schema for fresh installations.
-- Existing Supabase databases: this migration is marked applied on first run via the baseline.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  api_key TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  device_label TEXT NOT NULL,
  device_type TEXT DEFAULT 'unknown',
  user_agent TEXT,
  last_seen TIMESTAMPTZ DEFAULT NOW(),
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS novels (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  primary_url TEXT,
  author TEXT,
  genre TEXT,
  description TEXT,
  latest_chapter_num INTEGER,
  latest_chapter_title TEXT,
  chapters_updated_at TIMESTAMPTZ,
  site_latest_chapter_time_raw TEXT,
  site_latest_chapter_time TIMESTAMPTZ,
  cover_img TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

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
  read_through_num INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  FOREIGN KEY (device_id) REFERENCES devices (id) ON DELETE CASCADE,
  FOREIGN KEY (novel_id) REFERENCES novels (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_novel_meta (
  user_id TEXT NOT NULL,
  novel_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'reading' CHECK (status IN ('reading', 'completed', 'on-hold', 'dropped', 'plan-to-read', 'removed')),
  favorite BOOLEAN DEFAULT FALSE,
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  notes TEXT,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  current_read_through INTEGER DEFAULT 1,
  read_history JSONB DEFAULT '[]'::jsonb,
  PRIMARY KEY (user_id, novel_id),
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  FOREIGN KEY (novel_id) REFERENCES novels (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  novel_id TEXT NOT NULL,
  type TEXT NOT NULL,
  message TEXT NOT NULL,
  read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  FOREIGN KEY (novel_id) REFERENCES novels (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS bookmarks (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  novel_id TEXT NOT NULL,
  chapter_url TEXT NOT NULL,
  percent NUMERIC(5,2) NOT NULL CHECK (percent >= 0 AND percent <= 100),
  bookmark_type TEXT DEFAULT 'position' CHECK (bookmark_type IN ('position', 'highlight', 'note', 'favorite')),
  title TEXT,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  FOREIGN KEY (novel_id) REFERENCES novels (id) ON DELETE CASCADE,
  UNIQUE (user_id, novel_id, chapter_url, percent)
);

CREATE TABLE IF NOT EXISTS reading_sessions (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  novel_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  session_type TEXT DEFAULT 'manual' CHECK (session_type IN ('auto', 'manual', 'imported')),
  start_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  end_time TIMESTAMPTZ,
  start_percent NUMERIC(5,2) CHECK (start_percent >= 0 AND start_percent <= 100),
  end_percent NUMERIC(5,2) CHECK (end_percent >= 0 AND end_percent <= 100),
  time_spent_seconds INTEGER DEFAULT 0 CHECK (time_spent_seconds >= 0),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  FOREIGN KEY (novel_id) REFERENCES novels (id) ON DELETE CASCADE,
  FOREIGN KEY (device_id) REFERENCES devices (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS novel_notes (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  novel_id TEXT NOT NULL,
  note_text TEXT NOT NULL,
  chapter_num INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  FOREIGN KEY (novel_id) REFERENCES novels (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_settings (
  user_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, key),
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS novel_categories (
  user_id TEXT NOT NULL,
  novel_id TEXT NOT NULL,
  category TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, novel_id, category),
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  FOREIGN KEY (novel_id) REFERENCES novels (id) ON DELETE CASCADE
);
