import { Router } from 'express';
import { HTTP_BAD_REQUEST, HTTP_CONFLICT } from '../config.js';
import logger from '../logger.js';
import { validateApiKey } from '../middleware/auth.js';
import { runNovelArrowProbe } from '../services/NovelArrowProbe.js';

const router = Router();
let probeRunning = false;

router.post(
  '/api/v1/admin/diagnostics/novelarrow',
  validateApiKey,
  async (req, res) => {
    if (probeRunning) {
      res.status(HTTP_CONFLICT).json({ error: 'A probe is already running' });
      return;
    }

    probeRunning = true;
    try {
      const result = await runNovelArrowProbe(
        (req.body as Record<string, unknown>).urls,
      );
      res.json(result);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Invalid probe request';
      logger.warn({ error }, 'NovelArrow diagnostic probe rejected');
      res.status(HTTP_BAD_REQUEST).json({ error: message });
    } finally {
      probeRunning = false;
    }
  },
);

export default router;
