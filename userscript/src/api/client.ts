import { READSYNC_API_BASE, READSYNC_API_KEY } from '../config.js';
import type {
  SyncPayload,
  CompareResult,
  AutoUpdatePayload,
  CoverUploadResult,
} from '../types/index.js';

export interface ProgressResult {
  updated: boolean;
  rejected_reason?: string | null;
  auto_reread?: boolean;
}

/** POST /api/v1/progress — sync scroll progress */
export async function postProgress(payload: SyncPayload): Promise<ProgressResult | null> {
  const res = await fetch(`${READSYNC_API_BASE}/progress`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  return res.json() as Promise<ProgressResult>;
}

/** Fire-and-forget via sendBeacon — used on page unload */
export function beaconProgress(payload: SyncPayload): boolean {
  if (!navigator.sendBeacon) return false;
  const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
  return navigator.sendBeacon(`${READSYNC_API_BASE}/progress`, blob);
}

/** GET /api/v1/compare — check if another device is ahead */
export async function compareProgress(novelId: string, deviceId: string): Promise<CompareResult> {
  const params = new URLSearchParams({
    user_key: READSYNC_API_KEY,
    novel_id: novelId,
    device_id: deviceId,
  });
  const res = await fetch(`${READSYNC_API_BASE}/compare?${params.toString()}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<CompareResult>;
}

/** POST /api/v1/admin/novels/auto-update — update novel metadata from novel page */
export async function postAutoUpdate(payload: AutoUpdatePayload): Promise<unknown> {
  const res = await fetch(
    `${READSYNC_API_BASE}/admin/novels/auto-update?user_key=${encodeURIComponent(READSYNC_API_KEY)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw Object.assign(new Error(`HTTP ${res.status}: ${text}`), { status: res.status });
  }
  return res.json();
}

/** POST /api/v1/covers/:novelId/upload — hand the server real cover bytes
 *  fetched from the reader's own connection, since it can't reach the source
 *  itself (see CoverUploader.ts for why). */
export async function postCoverUpload(
  novelId: string,
  imageBase64: string,
  contentType: string,
): Promise<CoverUploadResult> {
  const res = await fetch(
    `${READSYNC_API_BASE}/covers/${encodeURIComponent(novelId)}/upload`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_key: READSYNC_API_KEY,
        image_base64: imageBase64,
        content_type: contentType,
      }),
    },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  return res.json() as Promise<CoverUploadResult>;
}

/** POST /api/v1/novels/:novelId/reread — archive current run, start re-read */
export async function postReread(novelId: string): Promise<unknown> {
  const res = await fetch(
    `${READSYNC_API_BASE}/novels/${encodeURIComponent(novelId)}/reread?user_key=${encodeURIComponent(READSYNC_API_KEY)}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' } },
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
