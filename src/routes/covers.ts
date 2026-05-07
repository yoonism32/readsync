import { createClient } from '@supabase/supabase-js';
import { Router } from 'express';
import { HTTP_INTERNAL_ERROR, HTTP_NOT_FOUND } from '../config.js';
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

async function fetchCoverWithRetry(
  url: string,
  maxRetries = 3,
): Promise<Response> {
  const fetch = (await import('node-fetch')).default;
  let lastError: Error = new Error('Unknown error');

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          Referer: 'https://novelbin.com/',
        },
      });

      // Don't retry on definitive 404 — retrying won't help
      if (response.status === 404) return response as unknown as Response;
      if (response.ok) return response as unknown as Response;

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
        res.setHeader('Cache-Control', 'public, max-age=86400'); // 24h — URL is stable
        return res.redirect(cachedCoverUrl);
      }

      if (cachedCoverUrl === 'failed' && !forceRefresh) {
        return res.status(HTTP_NOT_FOUND).send('Cover not available');
      }

      if (!supabase) {
        return res
          .status(HTTP_INTERNAL_ERROR)
          .json({ error: 'Cover storage not configured' });
      }

      const slug = String(novelId).replace(/^novelbin:/, '');
      const coverUrl = `https://images.novelbin.com/novel/${slug}.jpg`;

      logger.debug({ slug }, 'Fetching cover');

      let response: Response;
      try {
        response = await fetchCoverWithRetry(coverUrl);
      } catch (fetchErr) {
        logger.warn(
          { slug, error: (fetchErr as Error).message },
          'Cover fetch failed after retries',
        );
        await pool.query('UPDATE novels SET cover_img = $1 WHERE id = $2', [
          'failed',
          novelId,
        ]);
        return res
          .status(HTTP_NOT_FOUND)
          .json({ error: 'Cover not found on source' });
      }

      if (!response.ok) {
        logger.warn({ slug, status: response.status }, 'Cover fetch failed');
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
