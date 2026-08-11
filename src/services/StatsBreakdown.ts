interface BucketRow {
  sessions: string | number;
  seconds: string | number;
}

interface Bucket {
  index: number;
  sessions: number;
  seconds: number;
}

/**
 * Zero-fills a sparse GROUP BY result (only rows with data) into a dense
 * 0..size-1 series, so the frontend never has to backfill missing hours/
 * weekdays itself. `indexOf` reads the bucket key off each row — pg returns
 * EXTRACT(...) as numeric, i.e. a string, so this coerces defensively.
 */
export function fillBuckets(
  rows: Array<BucketRow & Record<string, unknown>>,
  size: number,
  indexOf: (row: Record<string, unknown>) => unknown,
): Bucket[] {
  const byIndex = new Map(rows.map((r) => [Number(indexOf(r)), r]));
  return Array.from({ length: size }, (_, index) => ({
    index,
    sessions: Number(byIndex.get(index)?.sessions ?? 0),
    seconds: Number(byIndex.get(index)?.seconds ?? 0),
  }));
}
