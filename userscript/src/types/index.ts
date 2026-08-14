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
  /**
   * True when latestChapterNum is corroborated by an authoritative signal
   * (a titled meta/.l-chapter chapter name, the novel's own header count, or
   * a confirmed main-page fetch) rather than resting solely on the generic
   * any-link-containing-"chapter" scan — the strategy that mistook a "Next
   * Chapter" nav link for the novel's latest chapter. See
   * ChapterCorrection.ts for how this gates backward corrections.
   */
  verified: boolean;
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
  latest_chapter_verified: boolean;
  current_chapter_num: number;
  current_chapter_source: string;
}

/** Response from GET /compare */
export interface CompareResult {
  should_prompt_jump: boolean;
  global_state: GlobalState | null;
  device_state: GlobalState | null;
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
  chapter_verified: boolean;
  genres: string | null;
  author: string | null;
  update_time_raw: string | null;
  cover_url: string | null;
}

/** Response from POST /covers/:novelId/upload */
export interface CoverUploadResult {
  alreadyMirrored: boolean;
  cover_img?: string;
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
