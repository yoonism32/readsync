// Tracks which novels we've already uploaded a mirrored cover for, so
// CoverUploader doesn't re-fetch and re-upload the same image on every
// chapter view. Best-effort like OfflineQueue.ts — a localStorage failure
// (quota/private mode) just means we'll upload again next time, not a bug.

const CACHE_KEY = 'readsync_cover_upload_cache';
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

const log = (...args: unknown[]) => {
  try {
    console.debug('[ReadSync:coverCache]', ...args);
  } catch {
    /* */
  }
};

interface CacheEntry {
  uploadedAt: number;
}

type CacheMap = Record<string, CacheEntry>;

function load(): CacheMap {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as CacheMap) : {};
  } catch {
    return {};
  }
}

function save(map: CacheMap): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(map));
  } catch (e) {
    log('save failed (quota/private mode?)', e);
  }
}

/** Pure — no localStorage access, so this is the part worth unit-testing. */
export function isEntryFresh(
  entry: CacheEntry | undefined,
  now: number,
  ttlMs = TTL_MS,
): boolean {
  return !!entry && now - entry.uploadedAt <= ttlMs;
}

export function hasRecentUpload(novelId: string, now = Date.now()): boolean {
  return isEntryFresh(load()[novelId], now);
}

export function markUploaded(novelId: string, now = Date.now()): void {
  const map = load();
  map[novelId] = { uploadedAt: now };
  save(map);
}
