import { Router } from 'express';
import { HTTP_BAD_REQUEST, HTTP_INTERNAL_ERROR } from '../config.js';
import pool from '../db/pool.js';
import logger from '../logger.js';
import { requireAuthAPI, validateApiKey } from '../middleware/auth.js';
import { handleDbError } from '../middleware/errorHandler.js';
import type { AuthenticatedRequest } from '../types/index.js';

const router = Router();

router.get(
  '/api/v1/settings/last-refresh',
  requireAuthAPI,
  validateApiKey,
  async (req, res) => {
    try {
      const result = await pool.query(
        `
      SELECT value, updated_at
      FROM user_settings
      WHERE user_id = $1 AND key = 'last_novel_refresh'
    `,
        [(req as AuthenticatedRequest).user.id],
      );

      if (result.rows.length === 0) {
        return res.json({ last_refresh: null, updated_at: null });
      }

      res.json({
        last_refresh: result.rows[0].value,
        updated_at: result.rows[0].updated_at,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to get last refresh time');
      res.status(HTTP_INTERNAL_ERROR).json({ error: 'Internal server error' });
    }
  },
);

router.post(
  '/api/v1/settings/last-refresh',
  requireAuthAPI,
  validateApiKey,
  async (req, res) => {
    const { timestamp } = req.body as { timestamp?: string };

    if (!timestamp) {
      return res.status(HTTP_BAD_REQUEST).json({ error: 'Missing timestamp' });
    }

    try {
      await pool.query(
        `
      INSERT INTO user_settings (user_id, key, value, updated_at)
      VALUES ($1, 'last_novel_refresh', $2, CURRENT_TIMESTAMP)
      ON CONFLICT (user_id, key)
      DO UPDATE SET value = $2, updated_at = CURRENT_TIMESTAMP
    `,
        [(req as AuthenticatedRequest).user.id, timestamp],
      );

      logger.info(
        { user_id: (req as AuthenticatedRequest).user.id, timestamp },
        'Saved last refresh time',
      );

      res.json({ success: true, last_refresh: timestamp });
    } catch (error) {
      handleDbError(res, error, 'Save last refresh time');
    }
  },
);

/**
 * User preferences, stored as rows in the generic user_settings key/value
 * table. Keys are allow-listed and each value is parsed and clamped here so a
 * malformed PUT can never write a value the UI would later choke on.
 */
const REFRESH_INTERVAL_MIN_HOURS = 1;
const REFRESH_INTERVAL_MAX_HOURS = 168;
const REFRESH_INTERVAL_DEFAULT_HOURS = 24;

interface PrefSpec {
  storageKey: string;
  parse: (raw: unknown) => string | null;
  read: (stored: string | undefined) => number | boolean;
}

const PREFS: Record<string, PrefSpec> = {
  refresh_interval_hours: {
    storageKey: 'refresh_interval_hours',
    parse: raw => {
      const n = Math.round(Number(raw));
      if (!Number.isFinite(n) || n < REFRESH_INTERVAL_MIN_HOURS || n > REFRESH_INTERVAL_MAX_HOURS) {
        return null;
      }
      return String(n);
    },
    read: stored => {
      const n = Number(stored);
      return Number.isFinite(n) && n > 0 ? n : REFRESH_INTERVAL_DEFAULT_HOURS;
    },
  },
  notifications_enabled: {
    storageKey: 'notifications_enabled',
    parse: raw => (typeof raw === 'boolean' ? String(raw) : null),
    // Defaults to false: the app must not assume consent to notify.
    read: stored => stored === 'true',
  },
};

router.get('/api/v1/settings/prefs', requireAuthAPI, validateApiKey, async (req, res) => {
  try {
    const result = await pool.query<{ key: string; value: string }>(
      `SELECT key, value FROM user_settings WHERE user_id = $1 AND key = ANY($2)`,
      [(req as AuthenticatedRequest).user.id, Object.values(PREFS).map(p => p.storageKey)],
    );

    const stored = new Map(result.rows.map(r => [r.key, r.value]));
    const prefs: Record<string, number | boolean> = {};
    for (const [name, spec] of Object.entries(PREFS)) {
      prefs[name] = spec.read(stored.get(spec.storageKey));
    }

    res.json(prefs);
  } catch (error) {
    logger.error({ error }, 'Failed to read preferences');
    res.status(HTTP_INTERNAL_ERROR).json({ error: 'Internal server error' });
  }
});

router.put('/api/v1/settings/prefs', requireAuthAPI, validateApiKey, async (req, res) => {
  const body = req.body as Record<string, unknown>;
  const writes: Array<[string, string]> = [];

  for (const [name, raw] of Object.entries(body ?? {})) {
    const spec = PREFS[name];
    if (!spec) {
      return res.status(HTTP_BAD_REQUEST).json({ error: `Unknown setting: ${name}` });
    }
    const parsed = spec.parse(raw);
    if (parsed === null) {
      return res.status(HTTP_BAD_REQUEST).json({ error: `Invalid value for ${name}` });
    }
    writes.push([spec.storageKey, parsed]);
  }

  if (writes.length === 0) {
    return res.status(HTTP_BAD_REQUEST).json({ error: 'No settings provided' });
  }

  try {
    for (const [key, value] of writes) {
      await pool.query(
        `INSERT INTO user_settings (user_id, key, value, updated_at)
         VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
         ON CONFLICT (user_id, key)
         DO UPDATE SET value = $3, updated_at = CURRENT_TIMESTAMP`,
        [(req as AuthenticatedRequest).user.id, key, value],
      );
    }

    res.json({ success: true });
  } catch (error) {
    handleDbError(res, error, 'Save preferences');
  }
});

export default router;
