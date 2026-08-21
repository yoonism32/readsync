import {
  CHAPTER_RESTART_THRESHOLD_PERCENT,
  SIGNIFICANT_PROGRESS_THRESHOLD_PERCENT,
} from '../config.js';

export type RejectedReason =
  | 'same_chapter_lower_percent'
  | 'behind_chapter'
  | 'chapter_restart_guard'
  | null;

export interface ProgressUpdateDecision {
  shouldUpdate: boolean;
  rejectedReason: RejectedReason;
}

export interface PrevProgress {
  chapter_num: number;
  percent: string;
}

/**
 * Max-progress policy: does this sync move the bookmark forward, or should
 * it be rejected? rejectedReason distinguishes a quiet peek at an earlier
 * chapter (bookmark stays safe) from mere same-chapter noise, so clients
 * can offer "re-read from here". The three checks don't short-circuit —
 * later matches intentionally overwrite an earlier rejectedReason, so
 * chapter_restart_guard can supersede same_chapter_lower_percent when both
 * conditions hold on the same sync.
 */
export function decideProgressUpdate(
  prev: PrevProgress | undefined,
  chapterNum: number,
  percentValue: number,
): ProgressUpdateDecision {
  let shouldUpdate = true;
  let rejectedReason: RejectedReason = null;

  if (!prev) return { shouldUpdate, rejectedReason };

  if (
    prev.chapter_num === chapterNum &&
    percentValue <= parseFloat(prev.percent)
  ) {
    shouldUpdate = false;
    rejectedReason = 'same_chapter_lower_percent';
  }
  if (chapterNum < prev.chapter_num) {
    shouldUpdate = false;
    rejectedReason = 'behind_chapter';
  }
  if (
    percentValue <= CHAPTER_RESTART_THRESHOLD_PERCENT &&
    parseFloat(prev.percent) > SIGNIFICANT_PROGRESS_THRESHOLD_PERCENT &&
    prev.chapter_num === chapterNum
  ) {
    shouldUpdate = false;
    rejectedReason = 'chapter_restart_guard';
  }

  return { shouldUpdate, rejectedReason };
}
