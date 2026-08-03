// Shared frontend types — mirror server types/index.ts

export type NovelStatus = 'reading' | 'completed' | 'on-hold' | 'dropped' | 'plan-to-read' | 'removed';
export type BookmarkType = 'position' | 'highlight' | 'note' | 'favorite';
export type DeviceType = 'mobile' | 'desktop';

// Flat view consumed by pages. The wire format has nested
// latest_global/latest_per_device — see api/normalize.ts.
export interface Novel {
  novel_id: string;
  title: string;
  primary_url: string | null;
  author: string | null;
  genre: string | null;
  status: NovelStatus;
  favorite: boolean;
  /** 0 = unrated (server COALESCEs NULL to 0) */
  rating: number;
  notes: string | null;
  latest_chapter_num: number | null;
  latest_chapter_title: string | null;
  chapters_updated_at: string | null;
  site_latest_chapter_time: string | null;
  site_latest_chapter_time_raw: string | null;
  last_activity: string | null;
  started_at: string | null;
  completed_at: string | null;
  current_read_through: number;
  read_history: ReadThroughEntry[];
  // flattened from latest_global / latest_per_device
  latest_chapter: number | null;
  latest_percent: number | null;
  latest_url: string | null;
  latest_device_id: string | null;
  latest_device_label: string | null;
  latest_read_at: string | null;
  devices_reading: DeviceProgress[];
}

export interface DeviceProgress {
  device_id: string;
  device_label: string;
  chapter_num: number;
  percent: number;
  url: string;
  created_at: string;
}

export interface ReadThroughEntry {
  read_through: number;
  started_at: string;
  completed_at: string;
  max_chapter: number;
  max_percent: number;
}

export interface Device {
  id: string;
  device_label: string;
  device_type: DeviceType;
  last_seen: string;
  active: boolean;
  total_snapshots: number;
  last_activity: string | null;
}

export interface Bookmark {
  id: number;
  novel_id: string;
  title?: string;
  chapter_url: string;
  percent: number;
  bookmark_type: BookmarkType;
  note: string | null;
  created_at: string;
}

export interface Note {
  id: number;
  note_text: string;
  chapter_num: number | null;
  created_at: string;
  updated_at: string;
}

export interface CategoryAssignment {
  novel_id: string;
  category: string;
}

export interface StatsSummary {
  total_novels: number;
  novels_by_status: Record<string, number>;
  avg_progress: number;
  reading_sessions: {
    total: number;
    total_time_seconds: number;
    avg_session_seconds: number;
  };
  total_bookmarks: number;
  active_devices: number;
}

export interface AppNotification {
  id: number;
  novel_id: string;
  novel_title: string | null;
  type: string;
  message: string;
  read: boolean;
  created_at: string;
}

export interface NotificationsResponse {
  notifications: AppNotification[];
  unread_count: number;
}

export interface BotStatus {
  running: boolean;
  lastRun: string | null;
  lastRunSuccess: boolean;
  novelsUpdated: number;
  novelsChecked: number;
  nextRun: string | null;
  errors: string[];
}

export interface AuthStatus {
  authenticated: boolean;
  username?: string;
}
