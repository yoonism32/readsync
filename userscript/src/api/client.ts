import { READSYNC_API_BASE, getApiKey } from '../config.js';
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

function headers(): Record<string, string> {
  const key = getApiKey();
  if (!key) throw new Error('HTTP 401: Rebuild ReadSync with API_KEY set in the environment');
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` };
}

/** POST /api/v1/progress — sync scroll progress */
export async function postProgress(payload: SyncPayload): Promise<ProgressResult | null> {
  const res = await fetch(`${READSYNC_API_BASE}/progress`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ ...payload, user_key: getApiKey() }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  return res.json() as Promise<ProgressResult>;
}

/** Fire-and-forget via keepalive fetch — used on page unload */
export function beaconProgress(payload: SyncPayload): boolean {
  if (!getApiKey()) return false;
  void fetch(`${READSYNC_API_BASE}/progress`, {
    method: 'POST', headers: headers(), keepalive: true,
    body: JSON.stringify({ ...payload, user_key: getApiKey() }),
  }).catch(() => {});
  return true;
}

/** GET /api/v1/compare — check if another device is ahead */
export async function compareProgress(novelId: string, deviceId: string): Promise<CompareResult> {
  const params = new URLSearchParams({
    user_key: getApiKey(), // Compatibility with the deployed 5.7.5-era server.
    novel_id: novelId,
    device_id: deviceId,
  });
  const res = await fetch(`${READSYNC_API_BASE}/compare?${params.toString()}`, { headers: headers() });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<CompareResult>;
}

/** POST /api/v1/admin/novels/auto-update — update novel metadata from novel page */
export async function postAutoUpdate(payload: AutoUpdatePayload): Promise<unknown> {
  const res = await fetch(
    `${READSYNC_API_BASE}/admin/novels/auto-update`,
    {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ ...payload, user_key: getApiKey() }),
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
      headers: headers(),
      body: JSON.stringify({
        user_key: getApiKey(),
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
    `${READSYNC_API_BASE}/novels/${encodeURIComponent(novelId)}/reread`,
    { method: 'POST', headers: headers(), body: JSON.stringify({ user_key: getApiKey() }) },
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
