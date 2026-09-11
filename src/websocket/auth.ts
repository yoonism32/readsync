import type { Request } from 'express';
import type { Socket } from 'socket.io';
import { ALLOWED_ORIGINS } from '../config.js';
import pool from '../db/pool.js';
import logger from '../logger.js';

declare module 'socket.io' {
  interface Socket {
    userId: string;
  }
}

export async function authenticateSocket(
  socket: Socket,
  next: (err?: Error) => void,
): Promise<void> {
  const request = socket.request as Request;
  const origin = socket.handshake.headers.origin;
  // Same-origin polling GETs may omit Origin. Fetch Metadata still identifies
  // them; cross-site handshakes must supply an explicitly allowed origin.
  const originAllowed = origin
    ? ALLOWED_ORIGINS.includes(origin)
    : socket.handshake.headers['sec-fetch-site'] === 'same-origin';
  if (
    !originAllowed ||
    !request.session?.authenticated ||
    !request.session.userId
  ) {
    return next(new Error('Authenticated browser session required'));
  }

  try {
    const result = await pool.query<{ id: string }>(
      'SELECT id FROM users WHERE id = $1',
      [request.session.userId],
    );

    if (result.rows.length === 0) {
      return next(new Error('Invalid API key'));
    }

    socket.userId = result.rows[0].id;
    next();
  } catch (error) {
    logger.error({ error }, 'WebSocket authentication error');
    next(new Error('Authentication failed'));
  }
}
