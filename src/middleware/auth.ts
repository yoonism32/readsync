import type { NextFunction, Request, Response } from 'express';
import 'express-session';
import { HTTP_UNAUTHORIZED } from '../config.js';
import pool from '../db/pool.js';
import type { AuthenticatedRequest } from '../types/index.js';

declare module 'express-session' {
  interface SessionData {
    authenticated?: boolean;
    username?: string;
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

/** Validate API key from query string or body; attaches req.user on success. */
export async function validateApiKey(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const user_key =
    (req.body as Record<string, unknown>)?.user_key ?? req.query?.user_key;

  if (!user_key) {
    res.status(HTTP_UNAUTHORIZED).json({ error: 'API key required' });
    return;
  }

  try {
    const result = await pool.query<{ id: string; display_name: string }>(
      'SELECT id, display_name FROM users WHERE api_key = $1',
      [user_key],
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
