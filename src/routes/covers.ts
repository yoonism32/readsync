import { createClient } from '@supabase/supabase-js';
import { Router } from 'express';
import {
  HTTP_BAD_REQUEST,
  HTTP_GONE,
  HTTP_INTERNAL_ERROR,
  HTTP_NOT_FOUND,
} from '../config.js';
import pool from '../db/pool.js';
import logger from '../logger.js';
import { validateApiKey } from '../middleware/auth.js';
import { handleDbError } from '../middleware/errorHandler.js';
import { validateNovelId } from '../middleware/validation.js';
import type { AuthenticatedRequest } from '../types/index.js';

const SUPABASE_URL = process.env.SUPABASE_URL ?? '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY ?? '';

const supabase =
  SUPABASE_URL && SUPABASE_SERVICE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    : null;

const router = Router();

/** Path fragment every URL we mirrored into our own bucket contains. */
const MIRRORED_PATH = '/storage/v1/object/public/novel-covers/';

/**
 * Has this cover been mirrored into our bucket, or is it still pointing at the
 * source site?
 *
 * `novels.cover_img` has two writers. This route mirrors the image and stores
 * our own URL, but the admin auto-update also stamps the scraped
 * images.novelarrow.com URL whenever the column is NULL or 'failed'. Whichever
 * runs first wins, so a novel refreshed by the userscript before anyone viewed
 * its cover keeps hotlinking the source forever — the mirroring branch below is
 * unreachable once any URL is cached.
 */
export function isMirroredCover(url: string | null): boolean {
  return !!url && url.includes(MIRRORED_PATH);
}

/** Novel IDs still carry the legacy novelbin: prefix; the slug on disk never does. */
export function normalizeSlug(novelId: string): string {
  return String(novelId).replace(/^novelbin:/, '');
}

/** Where the cover lives on the source site. */
export function sourceCoverUrl(novelId: string): string {
  return `https://images.novelarrow.com/novel/${normalizeSlug(novelId)}.jpg`;
}

/**
 * How long to stop re-attempting a mirror that just failed for a reason that
 * isn't going to resolve itself in the next few seconds.
 */
export const MIRROR_RETRY_COOLDOWN_MS = 6 * 60 * 60 * 1000; // 6h

/**
 * Should we skip the mirror attempt and send the reader straight to the source?
 *
 * images.novelarrow.com returns 403 to Render's datacenter egress — the same
 * URLs serve 200 from a residential connection, and no header combination
 * changes it. Without a cooldown, every render of the Explorer grid re-attempts
 * a dozen doomed mirrors, each burning three retries and ~3.5s of backoff.
 */
export function isMirrorOnCooldown(
  retryAt: number | undefined,
  now: number,
): boolean {
  return retryAt !== undefined && retryAt > now;
}

/** slug → epoch ms before which we won't retry mirroring. */
const mirrorCooldown = new Map<string, number>();

/**
 * Does this source response mean the image genuinely isn't there?
 *
 * Only a definitive answer may be written to `cover_img` as 'failed', because
 * that sentinel is terminal — nothing retries it, and the frontend never sends
 * ?refresh=true. A 5xx, a 429 or a hotlink-blocking 403 says nothing about
 * whether the image exists, and those are exactly the statuses that arrive for
 * a whole batch at once. Condemning on them poisons a dozen covers in one run.
 */
export function isMissingUpstream(status: number): boolean {
  return status === HTTP_NOT_FOUND || status === HTTP_GONE;
}

async function fetchCoverWithRetry(
  url: string,
  maxRetries = 3,
): Promise<Response> {
  let lastError: Error = new Error('Unknown error');

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          Referer: 'https://novelarrow.com/',
        },
      });

      // Don't retry on definitive 404 — retrying won't help
      if (response.status === 404) return response;
      if (response.ok) return response;

      lastError = new Error(`HTTP ${response.status}`);
    } catch (err) {
      lastError = err as Error;
    }

    if (attempt < maxRetries - 1) {
      const delay = 2 ** attempt * 500; // 500ms, 1s, 2s
      logger.debug({ url, attempt, delay }, 'Cover fetch retry');
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

/**
 * Upload cover bytes into the novel-covers bucket, point novels.cover_img at
 * the public URL, and clear any mirror-retry cooldown for the slug. Shared by
 * the GET route's server-side-fetch success path and the userscript upload
 * route below so "commit a mirrored cover" isn't duplicated between them.
 */
async function commitMirroredCover(
  novelId: string,
  slug: string,
  buffer: Buffer,
): Promise<string> {
  if (!supabase) {
    throw new Error('storage_not_configured');
  }

  const fileName = `${slug}.jpg`;
  // cacheControl is unset by default, which leaves Storage's own edge cache
  // at its 1-hour default — every reader's <img> hits Supabase Storage
  // directly (see the redirect below), so a short cache there means the same
  // immutable, slug-addressed file gets re-pulled from origin far more than
  // needed. Covers are only ever replaced by re-uploading under a new slug,
  // so a 1-year cache is safe.
  const { error: uploadError } = await supabase.storage
    .from('novel-covers')
    .upload(fileName, buffer, {
      contentType: 'image/jpeg',
      upsert: true,
      cacheControl: '31536000',
    });

  if (uploadError) {
    throw new Error(`upload_failed: ${uploadError.message}`);
  }

  const { data: urlData } = supabase.storage
    .from('novel-covers')
    .getPublicUrl(fileName);
  const publicUrl = urlData.publicUrl;

  await pool.query('UPDATE novels SET cover_img = $1 WHERE id = $2', [
    publicUrl,
    novelId,
  ]);

  // Mirroring works again for this slug — drop any cooldown so a recovered
  // source isn't ignored for the rest of the window.
  mirrorCooldown.delete(slug);

  logger.info(
    { slug, size_kb: Math.round(buffer.length / 1024) },
    'Cached cover',
  );

  return publicUrl;
}

/**
 * The first three bytes of every JPEG are the SOI marker. The upload route
 * below writes client-claimed bytes straight into a *public* bucket that
 * every reader's <img> tag loads — trusting the caller's content_type string
 * instead of sniffing would let a truncated fetch or an HTML error page get
 * served as a cover to everyone.
 */
export function isJpegMagicBytes(buffer: Buffer): boolean {
  return (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  );
}

// Real covers run 30-150KB. The ceiling is generous headroom against the
// app-wide 10mb JSON_BODY_LIMIT (the base64 payload can't be bounded any
// tighter at the body-parser layer, since that limit is shared by every
// route); the floor rejects empty/near-empty payloads outright.
export const MAX_COVER_UPLOAD_BYTES = 5 * 1024 * 1024;
export const MIN_COVER_UPLOAD_BYTES = 256;

export function isValidCoverUploadSize(byteLength: number): boolean {
  return (
    byteLength >= MIN_COVER_UPLOAD_BYTES && byteLength <= MAX_COVER_UPLOAD_BYTES
  );
}

/**
 * Per-user upload rate limit. isMirroredCover() already bounds real Storage
 * writes to ~once per novel ever, so this only matters for the pre-mirror
 * window: a buggy or malicious client bypassing the userscript's own
 * localStorage cache and hammering base64-decode/sniff work on
 * not-yet-mirrored novels.
 */
const UPLOAD_RATE_LIMIT = 20;
const UPLOAD_RATE_WINDOW_MS = 60 * 60 * 1000; // 1h
const uploadAttempts = new Map<string, number[]>();

function isUploadRateLimited(userId: string, now: number): boolean {
  const recent = (uploadAttempts.get(userId) ?? []).filter(
    (t) => now - t < UPLOAD_RATE_WINDOW_MS,
  );
  uploadAttempts.set(userId, recent);
  return recent.length >= UPLOAD_RATE_LIMIT;
}

function recordUploadAttempt(userId: string, now: number): void {
  const times = uploadAttempts.get(userId) ?? [];
  times.push(now);
  uploadAttempts.set(userId, times);
}

router.get(
  '/api/v1/covers/:novelId',
  validateApiKey,
  validateNovelId,
  async (req, res) => {
    const { novelId } = req.params;
    const forceRefresh = req.query.refresh === 'true';

    try {
      const novelResult = await pool.query<{ cover_img: string | null }>(
        'SELECT cover_img FROM novels WHERE id = $1',
        [novelId],
      );

      if (novelResult.rows.length === 0) {
        return res.status(HTTP_NOT_FOUND).json({ error: 'Novel not found' });
      }

      const cachedCoverUrl = novelResult.rows[0].cover_img;

      if (cachedCoverUrl && cachedCoverUrl !== 'failed' && !forceRefresh) {
        // Only our own mirrored URL is terminal. A source URL means the admin
        // auto-update got here first, so fall through and mirror it now —
        // unless storage isn't configured, in which case the source URL is
        // still better than a 500.
        if (isMirroredCover(cachedCoverUrl) || !supabase) {
          res.setHeader('Cache-Control', 'public, max-age=86400'); // 24h — URL is stable
          return res.redirect(cachedCoverUrl);
        }
      }

      if (cachedCoverUrl === 'failed' && !forceRefresh) {
        // JSON like every other exit from this route. The bare string used to
        // come back as text/html, which read like a routing miss rather than a
        // deliberate 404 and sent at least one debugging session sideways.
        return res
          .status(HTTP_NOT_FOUND)
          .json({ error: 'Cover not available' });
      }

      const slug = normalizeSlug(String(novelId));
      const coverUrl = sourceCoverUrl(String(novelId));

      /**
       * Hand the reader the source URL. Their browser fetches it from their own
       * connection, which the source serves happily — it is only our datacenter
       * egress it refuses. Cached briefly, not for a day, because this is a
       * degraded path we want to leave as soon as mirroring works again.
       */
      const redirectToSource = () => {
        res.setHeader('Cache-Control', 'public, max-age=300'); // 5m
        return res.redirect(coverUrl);
      };

      if (!supabase) {
        return redirectToSource();
      }

      if (
        !forceRefresh &&
        isMirrorOnCooldown(mirrorCooldown.get(slug), Date.now())
      ) {
        return redirectToSource();
      }

      logger.debug({ slug }, 'Fetching cover');

      let response: Response;
      try {
        response = await fetchCoverWithRetry(coverUrl);
      } catch (fetchErr) {
        // Reaching here means we could not reach the image, not that it is
        // missing — fetchCoverWithRetry returns a real 404 rather than throwing.
        // Leave cover_img alone and let the reader's browser fetch it directly.
        logger.warn(
          { slug, error: (fetchErr as Error).message },
          'Cover unreachable from here — serving source directly',
        );
        mirrorCooldown.set(slug, Date.now() + MIRROR_RETRY_COOLDOWN_MS);
        return redirectToSource();
      }

      if (!response.ok) {
        // Only condemn the cover when the source says the image isn't there.
        // A 5xx, 429 or hotlink-blocking 403 arrives for whole batches at once
        // and says nothing about whether the image exists.
        if (!isMissingUpstream(response.status)) {
          logger.warn(
            { slug, status: response.status },
            'Cover refused to us — serving source directly',
          );
          mirrorCooldown.set(slug, Date.now() + MIRROR_RETRY_COOLDOWN_MS);
          return redirectToSource();
        }

        logger.warn(
          { slug, status: response.status },
          'Cover missing at source',
        );
        await pool.query('UPDATE novels SET cover_img = $1 WHERE id = $2', [
          'failed',
          novelId,
        ]);
        return res
          .status(HTTP_NOT_FOUND)
          .json({ error: 'Cover not found on source' });
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      let publicUrl: string;
      try {
        publicUrl = await commitMirroredCover(String(novelId), slug, buffer);
      } catch (commitErr) {
        logger.error({ slug, commitErr }, 'Failed to upload cover');
        return res
          .status(HTTP_INTERNAL_ERROR)
          .json({ error: 'Failed to cache cover' });
      }

      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.redirect(publicUrl);
    } catch (error) {
      handleDbError(res, error, 'Fetch/cache cover');
    }
  },
);

/**
 * Userscript-assisted mirroring. images.novelarrow.com blocks Render's
 * datacenter egress (see MIRROR_RETRY_COOLDOWN_MS above) but not a reader's
 * own residential IP, and the userscript can reach past the CDN's missing
 * CORS headers via GM_xmlhttpRequest. This is the endpoint it POSTs the
 * bytes to so a real mirrored copy lands in the bucket — GET above still
 * covers readers without the userscript installed, or novels it hasn't
 * gotten to yet.
 */
router.post(
  '/api/v1/covers/:novelId/upload',
  validateApiKey,
  validateNovelId,
  async (req, res) => {
    const { novelId } = req.params;
    const { image_base64, content_type } = req.body as Record<string, unknown>;

    if (!supabase) {
      return res
        .status(HTTP_INTERNAL_ERROR)
        .json({ error: 'Storage not configured' });
    }

    try {
      const novelResult = await pool.query<{ cover_img: string | null }>(
        'SELECT cover_img FROM novels WHERE id = $1',
        [novelId],
      );

      if (novelResult.rows.length === 0) {
        return res.status(HTTP_NOT_FOUND).json({ error: 'Novel not found' });
      }

      const cachedCoverUrl = novelResult.rows[0].cover_img;

      // Already mirrored — skip the Storage write. This is also the primary
      // defense against redundant/abusive uploads: once a novel is mirrored
      // once, every later call for it is a single cheap SELECT.
      if (isMirroredCover(cachedCoverUrl)) {
        return res.json({ alreadyMirrored: true, cover_img: cachedCoverUrl });
      }

      const userId = (req as AuthenticatedRequest).user.id;
      const now = Date.now();
      if (isUploadRateLimited(userId, now)) {
        return res.status(429).json({ error: 'Too many upload attempts' });
      }
      recordUploadAttempt(userId, now);

      if (
        typeof image_base64 !== 'string' ||
        !image_base64 ||
        content_type !== 'image/jpeg'
      ) {
        return res
          .status(HTTP_BAD_REQUEST)
          .json({ error: 'Invalid cover payload' });
      }

      let buffer: Buffer;
      try {
        buffer = Buffer.from(image_base64, 'base64');
      } catch {
        return res
          .status(HTTP_BAD_REQUEST)
          .json({ error: 'Invalid base64 data' });
      }

      if (!isValidCoverUploadSize(buffer.length)) {
        return res
          .status(HTTP_BAD_REQUEST)
          .json({ error: 'Cover payload out of size bounds' });
      }

      if (!isJpegMagicBytes(buffer)) {
        return res
          .status(HTTP_BAD_REQUEST)
          .json({ error: 'Payload is not a valid JPEG' });
      }

      const slug = normalizeSlug(String(novelId));

      let publicUrl: string;
      try {
        publicUrl = await commitMirroredCover(String(novelId), slug, buffer);
      } catch (commitErr) {
        logger.error({ slug, commitErr }, 'Failed to upload userscript cover');
        return res
          .status(HTTP_INTERNAL_ERROR)
          .json({ error: 'Failed to cache cover' });
      }

      res.json({ alreadyMirrored: false, cover_img: publicUrl });
    } catch (error) {
      handleDbError(res, error, 'Upload cover');
    }
  },
);

export default router;
