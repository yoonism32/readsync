// Smart filter presets over the novel list. Pure predicates so they can
// be regression-tested; the UI maps ids to these.

import { behindCount } from './behindStatus.js';
import type { Novel } from '../types/index.js';

export type SmartFilterId = 'behind' | 'fresh' | 'almost' | 'stale';

export interface SmartFilter {
  id: SmartFilterId;
  label: string;
  description: string;
  predicate: (novel: Novel, now: Date) => boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const FRESH_DAYS = 7;
const STALE_DAYS = 30;
const BEHIND_THRESHOLD = 5;
const ALMOST_BEHIND_MAX = 2;
const ALMOST_PERCENT = 85;

const ageDays = (iso: string | null | undefined, now: Date): number | null => {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return (now.getTime() - t) / DAY_MS;
};

/** Reading, and the site has ≥5 chapters you haven't opened. */
export const isBehind = (novel: Novel): boolean =>
  novel.status === 'reading' && behindCount(novel) >= BEHIND_THRESHOLD;

/**
 * The site released chapters within the last 7 days. Uses the site's own
 * scraped release time only — chapters_updated_at means "we last checked,"
 * not "the site last published," so it can't stand in when the site time
 * is missing.
 */
export const isFresh = (novel: Novel, now: Date): boolean => {
  if (novel.status === 'removed') return false;
  const age = ageDays(novel.site_latest_chapter_time, now);
  return age != null && age <= FRESH_DAYS;
};

/** Caught up or nearly: ≤2 chapters behind, or ≥85% through the last known chapter. */
export const isAlmostDone = (novel: Novel): boolean => {
  if (novel.status !== 'reading') return false;
  if (novel.latest_chapter == null) return false;
  if (novel.latest_chapter_num != null) {
    return behindCount(novel) <= ALMOST_BEHIND_MAX;
  }
  return (novel.latest_percent ?? 0) >= ALMOST_PERCENT;
};

/** Marked reading but untouched for 30+ days. */
export const isStale = (novel: Novel, now: Date): boolean => {
  if (novel.status !== 'reading') return false;
  const age = ageDays(novel.latest_read_at, now);
  return age == null || age >= STALE_DAYS;
};

export const SMART_FILTERS: SmartFilter[] = [
  {
    id: 'behind',
    label: 'Behind 5+',
    description: 'Reading, with 5 or more unread chapters',
    predicate: n => isBehind(n),
  },
  {
    id: 'fresh',
    label: 'Updated this week',
    description: 'New chapters released in the last 7 days',
    predicate: (n, now) => isFresh(n, now),
  },
  {
    id: 'almost',
    label: 'Almost caught up',
    description: 'Within 2 chapters of the latest release',
    predicate: n => isAlmostDone(n),
  },
  {
    id: 'stale',
    label: 'Stale reads',
    description: 'Reading, but untouched for 30+ days',
    predicate: (n, now) => isStale(n, now),
  },
];
