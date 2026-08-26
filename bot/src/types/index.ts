export interface NovelRow {
  id: string;
  primary_url: string;
  latest_chapter_num: number | null;
  latest_chapter_title?: string | null;
  chapters_updated_at: string | null;
  last_read_at: string | null;
  active_readers: number;
}

export interface ParsedChapter {
  num: number;
  title: string | null;
}

export interface NovelInfo {
  chapter: ParsedChapter | null;
  genres: string[];
  author: string | null;
  site_latest_chapter_time_raw: string | null;
  site_latest_chapter_time: string | null;
  synopsis: string | null;
}

export interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  [key: string]: unknown;
}

export interface BotStatus {
  running: boolean;
  lastRun: string | null;
  lastRunSuccess: boolean;
  novelsUpdated: number;
  novelsChecked: number;
  nextRun: string | null;
  errors: LogEntry[];
  cycleStartTime: string | null;
  cycleDuration: string | null;
}

export interface SingleRunResult {
  success?: boolean;
  previous?: number | null;
  current?: number;
  title?: string | null;
  error?: string;
}
