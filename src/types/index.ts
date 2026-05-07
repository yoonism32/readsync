import type { Request } from 'express';

// ── Database row types ───────────────────────────────────────────────────────

export interface UserRow {
  id: string;
  display_name: string;
  api_key: string;
  created_at: Date;
}

export interface DeviceRow {
  id: string;
  user_id: string;
  device_label: string;
  device_type: 'mobile' | 'desktop' | 'unknown';
  user_agent: string | null;
  last_seen: Date;
  active: boolean;
  created_at: Date;
}

export interface NovelRow {
  id: string;
  title: string;
  primary_url: string | null;
  author: string | null;
  genre: string | null;
  description: string | null;
  latest_chapter_num: number | null;
  latest_chapter_title: string | null;
  chapters_updated_at: Date | null;
  site_latest_chapter_time_raw: string | null;
  site_latest_chapter_time: Date | null;
  cover_img: string | null;
  created_at: Date;
}

export interface ProgressSnapshotRow {
  id: bigint;
  user_id: string;
  device_id: string;
  novel_id: string;
  chapter_token: string | null;
  chapter_num: number | null;
  chapter_slug_extra: string | null;
  percent: string; // NUMERIC comes back as string from pg
  url: string | null;
  seconds_on_page: number;
  read_through_num: number;
  created_at: Date;
}

export interface UserNovelMetaRow {
  user_id: string;
  novel_id: string;
  status: NovelStatus;
  favorite: boolean;
  rating: number | null;
  notes: string | null;
  started_at: Date | null;
  completed_at: Date | null;
  updated_at: Date;
  current_read_through: number;
  read_history: ReadThroughEntry[];
}

export interface BookmarkRow {
  id: bigint;
  user_id: string;
  novel_id: string;
  chapter_url: string;
  percent: string;
  bookmark_type: BookmarkType;
  title: string | null;
  note: string | null;
  created_at: Date;
}

export interface ReadingSessionRow {
  id: bigint;
  user_id: string;
  novel_id: string;
  device_id: string;
  session_type: SessionType;
  start_time: Date;
  end_time: Date | null;
  start_percent: string | null;
  end_percent: string | null;
  time_spent_seconds: number;
  created_at: Date;
}

export interface NoteRow {
  id: bigint;
  user_id: string;
  novel_id: string;
  note_text: string;
  chapter_num: number | null;
  created_at: Date;
  updated_at: Date;
}

// ── Domain types ─────────────────────────────────────────────────────────────

export type NovelStatus =
  | 'reading'
  | 'completed'
  | 'on-hold'
  | 'dropped'
  | 'removed';
export type BookmarkType = 'position' | 'highlight' | 'note' | 'favorite';
export type SessionType = 'auto' | 'manual' | 'imported';
export type DeviceType = 'mobile' | 'desktop' | 'unknown';

export interface ReadThroughEntry {
  read_through: number;
  started_at: string;
  completed_at: string;
  max_chapter: number;
  max_percent: number;
}

export interface ChapterInfo {
  token: string;
  num: number;
}

export interface ProgressState {
  chapter_num: number | null;
  chapter_token: string | null;
  percent: number;
  device_id: string;
  device_label: string;
  url: string | null;
  ts: Date;
}

export interface LatestStates {
  latest_global: ProgressState | null;
  latest_per_device: Record<string, Omit<ProgressState, 'device_id'>>;
}

// ── Express augmentations ────────────────────────────────────────────────────

export interface AuthenticatedRequest extends Request {
  user: Pick<UserRow, 'id' | 'display_name'>;
  pagination: { limit: number; offset: number };
}

// ── API response envelope ────────────────────────────────────────────────────

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  meta?: {
    total: number;
    page: number;
    limit: number;
  };
}

// ── Bot ───────────────────────────────────────────────────────────────────────

export interface BotStatus {
  running: boolean;
  lastRun: string | null;
  lastRunSuccess: boolean;
  novelsUpdated: number;
  novelsChecked: number;
  nextRun: string | null;
  errors: unknown[];
  cycleStartTime?: string | null;
  cycleDuration?: string | null;
}
