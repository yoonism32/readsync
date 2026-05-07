import type { Socket } from 'socket.io';
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
  const apiKey =
    (socket.handshake.auth?.apiKey as string | undefined) ??
    (socket.handshake.query?.apiKey as string | undefined);

  if (!apiKey) {
    return next(new Error('API key required'));
  }

  try {
    const result = await pool.query<{ id: string }>(
      'SELECT id FROM users WHERE api_key = $1',
      [apiKey],
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
