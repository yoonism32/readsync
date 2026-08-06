// Gets real cover-image bytes into the server's bucket. images.novelarrow.com
// blocks Render's datacenter egress with a 403 that never resolves
// server-side, and sends no CORS headers, so even a page-context fetch()
// can't read the bytes cross-subdomain. GM_xmlhttpRequest runs on the
// reader's own residential IP and is exempt from the page's CORS policy —
// it's the only thing that can get real bytes past both.
//
// Best-effort and silent: a failure here must never affect the progress-sync
// or auto-update flow that already ran before this is called.

import { postCoverUpload } from '../api/client.js';
import { arrayBufferToBase64 } from '../utils/base64.js';
import { hasRecentUpload, markUploaded } from './CoverUploadCache.js';

const log = (...args: unknown[]) => {
  try {
    console.debug('[ReadSync:coverUpload]', ...args);
  } catch {
    /* */
  }
};

function fetchViaGM(url: string): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    GM_xmlhttpRequest({
      method: 'GET',
      url,
      responseType: 'arraybuffer',
      timeout: 15000,
      onload: (response) => {
        if (response.status >= 200 && response.status < 300) {
          resolve(response.response);
        } else {
          reject(new Error(`HTTP ${response.status}`));
        }
      },
      onerror: (err) => reject(err instanceof Error ? err : new Error('GM_xmlhttpRequest error')),
      ontimeout: () => reject(new Error('timeout')),
    });
  });
}

/** Fire-and-forget: fetch the cover via the reader's own connection and
 *  upload it, unless we've already confirmed a mirror recently. */
export async function uploadCoverIfNeeded(
  novelId: string,
  coverUrl: string | null,
): Promise<void> {
  try {
    if (!coverUrl || hasRecentUpload(novelId)) return;

    const buffer = await fetchViaGM(coverUrl);
    const base64 = arrayBufferToBase64(buffer);
    const result = await postCoverUpload(novelId, base64, 'image/jpeg');

    if (result.alreadyMirrored || result.cover_img) {
      markUploaded(novelId);
    }
    log('cover upload result', { novelId, ...result });
  } catch (e) {
    log('cover upload failed (non-fatal)', e);
  }
}
