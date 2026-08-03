// Hand-rolled subsequence fuzzy matcher for the command palette.
// Returns a score (higher = better) or null when the query doesn't
// match. Word-boundary and consecutive-run hits score extra so
// "sss" finds "Supreme Sword Saint" ahead of scattered matches.

export function fuzzyScore(query: string, text: string): number | null {
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  if (q.length === 0) return 0;
  if (q.length > t.length) return null;

  const exact = t.indexOf(q);
  if (exact !== -1) {
    return 100 - exact + (exact === 0 ? 20 : 0) + q.length;
  }

  let score = 0;
  let ti = 0;
  let prevHit = -2;
  for (let qi = 0; qi < q.length; qi++) {
    const idx = t.indexOf(q[qi], ti);
    if (idx === -1) return null;
    score += 1;
    if (idx === prevHit + 1) score += 4;
    if (idx === 0 || t[idx - 1] === ' ' || t[idx - 1] === '-') score += 6;
    prevHit = idx;
    ti = idx + 1;
  }
  return score - Math.floor(ti / 10);
}

export interface RankedItem<T> {
  item: T;
  score: number;
}

export function rankItems<T>(
  query: string,
  items: T[],
  textOf: (item: T) => string,
  limit = 12,
): T[] {
  if (!query.trim()) return items.slice(0, limit);
  const ranked: RankedItem<T>[] = [];
  for (const item of items) {
    const score = fuzzyScore(query.trim(), textOf(item));
    if (score != null) ranked.push({ item, score });
  }
  ranked.sort((a, b) => b.score - a.score);
  return ranked.slice(0, limit).map(r => r.item);
}
