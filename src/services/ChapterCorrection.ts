/**
 * Self-healing guard for novels.latest_chapter_num, shared by every writer
 * of that column: the userscript's per-chapter progress sync
 * (src/routes/progress.ts) and its novel-page auto-update
 * (src/routes/admin.ts). Same column, multiple independent writers — a
 * pending correction recorded by one path counts as confirmation for
 * either, since both are reporting on the same underlying fact.
 *
 * A single scrape reporting fewer chapters than stored is rejected outright
 * (a flaky page load must never claw back real progress). Two paths can then
 * confirm it as a genuine correction rather than noise:
 *
 *  - `verified`: the userscript says this number is corroborated by an
 *    authoritative signal (a titled chapter name, the novel's own header
 *    count, or a confirmed main-page fetch) — see ChapterDetector.ts's
 *    `verified` flag. Trusted on the first sighting; no need to wait for a
 *    repeat.
 *  - Otherwise, the SAME lower number reported twice — typically two page
 *    visits or Refresh All runs apart. This was the *only* rule until the
 *    2026-08-12 incident: a "Next Chapter" nav link on a chapter page always
 *    resolves to (current + 1), so it reproduces the exact same wrong number
 *    on every scroll-sync — a deterministic scraper bug satisfies "seen
 *    twice" just as reliably as a genuine systematic overshoot (e.g.
 *    ChapterDetector's header-count fallback beating a titled chapter —
 *    fixed 2026-08-06, see latestChapterDetection.test.ts) does. Repetition
 *    alone was never proof of correctness, only proof of non-randomness — so
 *    it remains a fallback for signals ChapterDetector can't mark verified,
 *    not a substitute for independent confirmation.
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
  verified = false,
): boolean {
  if (!isChapterRegression(scrapedNum, currentChapter)) return false;
  return verified || pendingNum === scrapedNum;
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
  verified = false,
): boolean {
  const pendingNum = pendingChapterCorrections.get(novelId);
  const isRegression = isChapterRegression(scrapedNum, currentChapter);
  const isConfirmedCorrection = isConfirmedChapterCorrection(
    pendingNum,
    scrapedNum,
    currentChapter,
    verified,
  );

  if (isRegression && !isConfirmedCorrection) {
    pendingChapterCorrections.set(novelId, scrapedNum);
  } else {
    pendingChapterCorrections.delete(novelId);
  }

  return isConfirmedCorrection;
}
