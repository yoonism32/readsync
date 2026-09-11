import { Router } from 'express';
import {
  HTTP_BAD_REQUEST,
  HTTP_INTERNAL_ERROR,
  HTTP_UNAUTHORIZED,
} from '../config.js';
import pool from '../db/pool.js';
import logger from '../logger.js';
import {
  requireAuth,
  requireAuthAPI,
  validateApiKey,
} from '../middleware/auth.js';
import {
  checkRateLimit,
  clearAttempts,
  recordAttempt,
} from '../middleware/rateLimiter.js';
import { createApiKey } from '../services/ApiKey.js';
import { verifyAdminCredentials } from '../services/AuthService.js';
import type { AuthenticatedRequest } from '../types/index.js';

const router = Router();

// ── API auth ────────────────────────────────────────────────────────────────

router.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body as {
    username?: string;
    password?: string;
  };
  const clientIp = req.ip ?? req.socket.remoteAddress ?? 'unknown';
  const rateLimit = checkRateLimit(clientIp);

  res.setHeader('X-RateLimit-Limit', String(5));
  res.setHeader('X-RateLimit-Remaining', String(rateLimit.remaining));
  res.setHeader('X-RateLimit-Reset', String(rateLimit.resetAt));

  if (!rateLimit.allowed) {
    const retryAfter = rateLimit.resetAt - Math.floor(Date.now() / 1000);
    return res.status(429).setHeader('Retry-After', String(retryAfter)).json({
      error: 'Too many login attempts. Please try again in 15 minutes.',
    });
  }

  // Reserve before bcrypt awaits, so parallel attempts cannot bypass the cap.
  recordAttempt(clientIp);
  if (
    typeof username !== 'string' ||
    typeof password !== 'string' ||
    !username ||
    !password ||
    username.length > 200 ||
    password.length > 1024
  ) {
    return res
      .status(HTTP_BAD_REQUEST)
      .json({ error: 'Username and password required' });
  }

  try {
    const valid = await verifyAdminCredentials(username, password);
    if (valid) {
      const users = await pool.query<{ id: string }>(
        'SELECT id FROM users WHERE ($1::text IS NULL OR id = $1) ORDER BY id LIMIT 2',
        [process.env.ADMIN_USER_ID || null],
      );
      if (users.rows.length !== 1)
        throw new Error(
          'Configure ADMIN_USER_ID for an existing unique account',
        );
      await new Promise<void>((resolve, reject) =>
        req.session.regenerate((err) => (err ? reject(err) : resolve())),
      );
      req.session.authenticated = true;
      req.session.username = username;
      req.session.userId = users.rows[0].id;
      await new Promise<void>((resolve, reject) =>
        req.session.save((err) => (err ? reject(err) : resolve())),
      );
      logger.info({ username, ip: clientIp }, 'Login successful');
      clearAttempts(clientIp);

      // The dashboard uses this session; userscript credentials are issued separately.
      return res.json({ success: true });
    }

    logger.warn({ username, ip: clientIp }, 'Login failed');
    return res
      .status(HTTP_UNAUTHORIZED)
      .json({ error: 'Invalid username or password' });
  } catch (error) {
    logger.error({ error }, 'Login error');
    return res
      .status(HTTP_INTERNAL_ERROR)
      .json({ error: 'Internal server error' });
  }
});

router.post('/api/auth/logout', (req, res) => {
  const username = req.session?.username;
  req.session.destroy((err) => {
    if (err) {
      logger.error({ err }, 'Logout error');
      return res.status(HTTP_INTERNAL_ERROR).json({ error: 'Logout failed' });
    }
    logger.info({ username }, 'Logout successful');
    res.clearCookie('connect.sid', { path: '/' });
    res.json({ success: true });
  });
});

// Issue a one-time-visible userscript credential, revoking the prior key.
router.post('/api/auth/api-key', requireAuthAPI, async (req, res) => {
  try {
    if (!req.session.userId)
      return res.status(401).json({ error: 'Please sign in again' });
    const { key, hash } = createApiKey();
    await pool.query('UPDATE users SET api_key = $1 WHERE id = $2', [
      hash,
      req.session.userId,
    ]);
    res.setHeader('Cache-Control', 'no-store');
    res.json({ api_key: key });
  } catch (error) {
    logger.error({ error }, 'API key lookup error');
    res.status(HTTP_INTERNAL_ERROR).json({ api_key: null });
  }
});

router.get('/api/auth/status', (req, res) => {
  if (req.session?.authenticated) {
    return res.json({ authenticated: true, username: req.session.username });
  }
  res.json({ authenticated: false });
});

router.get('/api/v1/auth/whoami', validateApiKey, (req, res) => {
  const { id, display_name } = (req as AuthenticatedRequest).user;
  res.json({ id, display_name, authenticated: true });
});

// ── Page routes ──────────────────────────────────────────────────────────────

router.get('/login', (_req, res) => res.redirect(301, '/app/login'));

router.get('/', (_req, res) => {
  res.redirect('/app/');
});

// The React SPA (frontend/, served at /app/*) is the front door and has a
// 1:1 replacement for every page below except /practice (API Route
// Explorer — never ported to the SPA, kept as a standalone dev tool).
// Sunset, 2026-09-08: legacy pages no longer serve their own HTML — every
// path (old bare path and its /legacy/* quarantine home alike) now
// redirects straight to the SPA. public/*.html for these pages can be
// deleted once nothing 404s in practice.

router.get('/legacy/dashboard', (_req, res) =>
  res.redirect(301, '/app/dashboard'),
);
router.get('/legacy-dashboard', (_req, res) =>
  res.redirect(301, '/app/dashboard'),
);

router.get('/legacy/manage', (_req, res) => res.redirect(301, '/app/manage'));
router.get('/manage', (_req, res) => res.redirect(301, '/app/manage'));

router.get('/legacy/settings', (_req, res) =>
  res.redirect(301, '/app/settings'),
);
router.get('/settings', (_req, res) => res.redirect(301, '/app/settings'));

router.get('/legacy/mylist', (_req, res) => res.redirect(301, '/app/mylist'));
router.get('/mylist', (_req, res) => res.redirect(301, '/app/mylist'));
router.get('/novels', (_req, res) => res.redirect(301, '/app/mylist'));

router.get('/legacy/novel/:novelId', (req, res) => {
  res.redirect(
    301,
    `/app/novel/${encodeURIComponent(String(req.params.novelId))}`,
  );
});
router.get('/novel/:novelId', (req, res) => {
  res.redirect(
    301,
    `/app/novel/${encodeURIComponent(String(req.params.novelId))}`,
  );
});
router.get('/novels/:novelId', (req, res) => {
  res.redirect(
    301,
    `/app/novel/${encodeURIComponent(String(req.params.novelId))}`,
  );
});

router.get('/legacy/admin', (_req, res) => res.redirect(301, '/app/admin'));
router.get('/admin', (_req, res) => res.redirect(301, '/app/admin'));

router.get('/legacy/explorer', (_req, res) =>
  res.redirect(301, '/app/explorer'),
);
router.get('/explorer', (_req, res) => res.redirect(301, '/app/explorer'));

// /practice has no SPA equivalent — left in place, still served.
router.get('/legacy/practice', requireAuth, (_req, res) => {
  res.status(410).send('The legacy API explorer has been retired.');
});
router.get('/practice', (_req, res) => res.redirect(301, '/legacy/practice'));

export default router;
