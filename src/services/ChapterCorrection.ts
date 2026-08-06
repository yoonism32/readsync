/**
 * Self-healing guard for novels.latest_chapter_num, shared by every writer
 * of that column: the userscript's per-chapter progress sync
 * (src/routes/progress.ts) and its novel-page auto-update
 * (src/routes/admin.ts). Same column, multiple independent writers — a
 * pending correction recorded by one path counts as confirmation for
 * either, since both are reporting on the same underlying fact.
 *
 * A single scrape reporting fewer chapters than stored is rejected outright
 * (a flaky page load must never claw back real progress). The SAME lower
 * number reported twice — typically two page visits or Refresh All runs
 * apart — is treated as a genuine correction instead of noise: a fluke
 * won't repeat the exact same wrong number, but a systematic overshoot
 * (e.g. ChapterDetector's header-count fallback beating a titled chapter —
 * fixed 2026-08-06, see latestChapterDetection.test.ts) reports the true
 * count every time.
 */

/** novelId → chapter_num seen once but not yet trusted as a correction. */
const pendingChapterCorrections = new Map<string, number>();

export function isChapterRegression(
  scrapedNum: number,
  currentChapter: number | null,
): boolean {
  return currentChapter !== null && scrapedNum < currentChapter;
}

export function isConfirmedChapterCorrection(
  pendingNum: number | undefined,
  scrapedNum: number,
  currentChapter: number | null,
): boolean {
  return (
    isChapterRegression(scrapedNum, currentChapter) && pendingNum === scrapedNum
  );
}

/**
 * Evaluate a scraped chapter number against the stored one, updating the
 * pending-correction state as a side effect. Returns whether this call
 * should be trusted to write scrapedNum even though it's lower than what's
 * currently stored.
 */
export function recordCorrectionAttempt(
  novelId: string,
  scrapedNum: number,
  currentChapter: number | null,
): boolean {
  const pendingNum = pendingChapterCorrections.get(novelId);
  const isRegression = isChapterRegression(scrapedNum, currentChapter);
  const isConfirmedCorrection = isConfirmedChapterCorrection(
    pendingNum,
    scrapedNum,
    currentChapter,
  );

  if (isRegression && !isConfirmedCorrection) {
    pendingChapterCorrections.set(novelId, scrapedNum);
  } else {
    pendingChapterCorrections.delete(novelId);
  }

  return isConfirmedCorrection;
}
