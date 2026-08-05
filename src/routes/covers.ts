import { createClient } from '@supabase/supabase-js';
import { Router } from 'express';
import { HTTP_GONE, HTTP_INTERNAL_ERROR, HTTP_NOT_FOUND } from '../config.js';
import pool from '../db/pool.js';
import logger from '../logger.js';
import { validateApiKey } from '../middleware/auth.js';
import { handleDbError } from '../middleware/errorHandler.js';
import { validateNovelId } from '../middleware/validation.js';

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

/** Where the cover lives on the source site. */
export function sourceCoverUrl(novelId: string): string {
  const slug = String(novelId).replace(/^novelbin:/, '');
  return `https://images.novelarrow.com/novel/${slug}.jpg`;
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

      const slug = String(novelId).replace(/^novelbin:/, '');
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

      const fileName = `${slug}.jpg`;
      const { error: uploadError } = await supabase.storage
        .from('novel-covers')
        .upload(fileName, buffer, { contentType: 'image/jpeg', upsert: true });

      if (uploadError) {
        logger.error({ slug, uploadError }, 'Failed to upload cover');
        return res
          .status(HTTP_INTERNAL_ERROR)
          .json({ error: 'Failed to cache cover' });
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
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.redirect(publicUrl);
    } catch (error) {
      handleDbError(res, error, 'Fetch/cache cover');
    }
  },
);

export default router;
