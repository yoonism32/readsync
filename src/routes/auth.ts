import path from 'node:path';
import { Router } from 'express';
import {
  HTTP_BAD_REQUEST,
  HTTP_INTERNAL_ERROR,
  HTTP_UNAUTHORIZED,
} from '../config.js';
import logger from '../logger.js';
import pool from '../db/pool.js';
import {
  redirectIfAuthenticated,
  requireAuth,
  validateApiKey,
} from '../middleware/auth.js';
import {
  checkRateLimit,
  clearAttempts,
  recordAttempt,
} from '../middleware/rateLimiter.js';
import { verifyAdminCredentials } from '../services/AuthService.js';
import type { AuthenticatedRequest } from '../types/index.js';

const PUBLIC_DIR = path.join(__dirname, '..', '..', 'public');

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

  if (!username || !password) {
    recordAttempt(clientIp);
    return res
      .status(HTTP_BAD_REQUEST)
      .json({ error: 'Username and password required' });
  }

  try {
    const valid = await verifyAdminCredentials(username, password);
    if (valid) {
      req.session.authenticated = true;
      req.session.username = username;
      logger.info({ username, ip: clientIp }, 'Login successful');
      clearAttempts(clientIp);

      // Single-tenant app: the session login (admin credentials) and the
      // API key (used by the SPA + userscript for /api/v1/* calls) are
      // separate credentials with no link between them, which used to
      // mean a successful session login could still leave the app
      // silently broken until the user manually pasted the right key.
      // Hand it back here so the client never has to ask.
      let api_key: string | null = null;
      try {
        const result = await pool.query<{ api_key: string }>(
          'SELECT api_key FROM users LIMIT 1',
        );
        api_key = result.rows[0]?.api_key ?? null;
      } catch (err) {
        logger.warn({ err }, 'Could not look up API key after login');
      }

      return res.json({ success: true, api_key });
    }

    recordAttempt(clientIp);
    logger.warn({ username, ip: clientIp }, 'Login failed');
    return res
      .status(HTTP_UNAUTHORIZED)
      .json({ error: 'Invalid username or password' });
  } catch (error) {
    logger.error({ error }, 'Login error');
    recordAttempt(clientIp);
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
    res.json({ success: true });
  });
});

// Session-authenticated recovery route: lets the SPA self-heal if its
// locally stored API key ever goes missing (cleared storage, a device
// that only ever had the session cookie) without forcing a re-login.
router.get('/api/auth/api-key', requireAuth, async (_req, res) => {
  try {
    const result = await pool.query<{ api_key: string }>(
      'SELECT api_key FROM users LIMIT 1',
    );
    res.json({ api_key: result.rows[0]?.api_key ?? null });
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

router.get('/login', redirectIfAuthenticated, (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'login.html'));
});

// The React SPA is the front door now; the legacy dashboard stays
// reachable at /legacy-dashboard and its direct .html paths.
router.get('/', (_req, res) => {
  res.redirect('/app/');
});

router.get('/legacy-dashboard', requireAuth, (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'dashboard.html'));
});

router.get('/manage', requireAuth, (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'manage.html'));
});

router.get('/settings', requireAuth, (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'settings.html'));
});

router.get('/novels', requireAuth, (_req, res) => res.redirect('/mylist'));

router.get('/mylist', requireAuth, (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'mylist.html'));
});

router.get('/novel/:novelId', requireAuth, (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'novel.html'));
});

router.get('/novels/:novelId', requireAuth, (req, res) => {
  res.redirect(`/novel/${encodeURIComponent(String(req.params.novelId))}`);
});

router.get('/admin', requireAuth, (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'admin.html'));
});

router.get('/explorer', requireAuth, (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'explorer.html'));
});

router.get('/practice', requireAuth, (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'practice.html'));
});

export default router;
