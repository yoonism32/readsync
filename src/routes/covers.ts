import { createClient } from '@supabase/supabase-js';
import { Router } from 'express';
import {
  HTTP_GONE,
  HTTP_INTERNAL_ERROR,
  HTTP_NOT_FOUND,
  HTTP_SERVICE_UNAVAILABLE,
} from '../config.js';
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
        return res.status(HTTP_NOT_FOUND).json({ error: 'Cover not available' });
      }

      if (!supabase) {
        return res
          .status(HTTP_INTERNAL_ERROR)
          .json({ error: 'Cover storage not configured' });
      }

      const slug = String(novelId).replace(/^novelbin:/, '');
      const coverUrl = `https://images.novelarrow.com/novel/${slug}.jpg`;

      logger.debug({ slug }, 'Fetching cover');

      let response: Response;
      try {
        response = await fetchCoverWithRetry(coverUrl);
      } catch (fetchErr) {
        // Reaching here means the network gave up, not that the image is
        // missing — fetchCoverWithRetry returns a real 404 rather than throwing.
        // Leave cover_img untouched so the next request tries again.
        logger.warn(
          { slug, error: (fetchErr as Error).message },
          'Cover fetch failed after retries — leaving cover unmarked for retry',
        );
        return res
          .status(HTTP_SERVICE_UNAVAILABLE)
          .json({ error: 'Cover temporarily unavailable' });
      }

      if (!response.ok) {
        // Only condemn the cover when the source says the image isn't there.
        // A 5xx, 429 or hotlink-blocking 403 arrives for whole batches at once
        // and says nothing about whether the image exists.
        if (!isMissingUpstream(response.status)) {
          logger.warn(
            { slug, status: response.status },
            'Cover source unhealthy — leaving cover unmarked for retry',
          );
          return res
            .status(HTTP_SERVICE_UNAVAILABLE)
            .json({ error: 'Cover temporarily unavailable' });
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
