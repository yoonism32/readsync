export interface ChapterInfo {
  /** Parsed chapter number (1–9999) */
  num: number;
  /** URL token, e.g. "chapter" or "cchapter" */
  token: string;
  /** Human-readable title text (when detected from content) */
  title?: string;
  /** Which detection strategy produced this result */
  source: string;
}

export interface LatestChapterInfo {
  latestChapterNum: number | null;
  latestChapterTitle: string | null;
}

export interface SyncPayload {
  user_key: string;
  device_id: string;
  device_label: string;
  novel_url: string;
  percent: number;
  seconds_on_page: number;
  latest_chapter_num: number | null;
  latest_chapter_title: string | null;
  current_chapter_num: number;
  current_chapter_source: string;
}

/** Response from GET /compare */
export interface CompareResult {
  should_prompt_jump: boolean;
  global_state: GlobalState | null;
}

/** The "ahead" device state returned by /compare */
export interface GlobalState {
  device_id: string;
  device_label: string;
  chapter_num: number;
  percent: number;
  url: string;
}

export interface AutoUpdatePayload {
  novel_id: string;
  chapter_num: number;
  chapter_title: string | null;
  genres: string | null;
  author: string | null;
  update_time_raw: string | null;
  cover_url: string | null;
}

export interface NovelUpdateMessage {
  type: 'NOVEL_UPDATE_COMPLETE';
  novelId: string;
  success: boolean;
  data?: unknown;
  reason?: string;
  status?: number;
  error?: string;
}
