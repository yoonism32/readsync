import { timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import 'express-session';
import { HTTP_UNAUTHORIZED } from '../config.js';
import pool from '../db/pool.js';
import { hashApiKey } from '../services/ApiKey.js';
import type { AuthenticatedRequest } from '../types/index.js';

declare module 'express-session' {
  interface SessionData {
    authenticated?: boolean;
    username?: string;
    userId?: string;
  }
}

/** Redirect to /login if browser session is not authenticated. */
export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (req.session?.authenticated) {
    req.session.touch();
    next();
    return;
  }
  res.redirect('/login');
}

/** 401 JSON response if browser session is not authenticated (for API routes). */
export function requireAuthAPI(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (req.session?.authenticated) {
    req.session.touch();
    next();
    return;
  }
  res.status(HTTP_UNAUTHORIZED).json({ error: 'Unauthorized' });
}

/** Redirect to / if already logged in (login page guard). */
export function redirectIfAuthenticated(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (req.session?.authenticated) {
    res.redirect('/');
    return;
  }
  next();
}

/** Authenticate a bound browser session or Bearer key; attach req.user once. */
export async function validateApiKey(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if ((req as AuthenticatedRequest).user) {
    next();
    return;
  }
  if (req.session?.authenticated && req.session.userId) {
    try {
      const result = await pool.query<{ id: string; display_name: string }>(
        'SELECT id, display_name FROM users WHERE id = $1',
        [req.session.userId],
      );
      if (!result.rows[0]) {
        res.status(401).json({ error: 'Unknown user' });
        return;
      }
      (req as AuthenticatedRequest).user = result.rows[0];
      next();
    } catch (error) {
      next(error);
    }
    return;
  }
  const authorization = req.get('authorization');
  const user_key = authorization?.startsWith('Bearer ')
    ? authorization.slice(7)
    : undefined;

  if (typeof user_key !== 'string' || !user_key || user_key.length > 256) {
    res.status(HTTP_UNAUTHORIZED).json({ error: 'API key required' });
    return;
  }

  try {
    // Explicit single-user deployment key, also embedded in the userscript build.
    const configuredKey = process.env.API_KEY?.trim();
    if (
      configuredKey &&
      timingSafeEqual(
        Buffer.from(hashApiKey(user_key)),
        Buffer.from(hashApiKey(configuredKey)),
      )
    ) {
      const ownerId = process.env.ADMIN_USER_ID?.trim();
      const owner = await pool.query<{ id: string; display_name: string }>(
        ownerId
          ? 'SELECT id, display_name FROM users WHERE id = $1 LIMIT 2'
          : 'SELECT id, display_name FROM users LIMIT 2',
        ownerId ? [ownerId] : [],
      );
      if (owner.rows.length !== 1) {
        res
          .status(HTTP_UNAUTHORIZED)
          .json({ error: 'API key user is not configured' });
        return;
      }
      (req as AuthenticatedRequest).user = owner.rows[0];
      next();
      return;
    }
    const result = await pool.query<{ id: string; display_name: string }>(
      'SELECT id, display_name FROM users WHERE api_key = $1',
      [hashApiKey(user_key)],
    );

    if (result.rows.length === 0) {
      res.status(HTTP_UNAUTHORIZED).json({ error: 'Invalid API key' });
      return;
    }

    (req as AuthenticatedRequest).user = result.rows[0];
    next();
  } catch (error) {
    next(error);
  }
}
