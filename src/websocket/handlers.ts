import type { Request } from 'express';
import type { Socket, Server as SocketServer } from 'socket.io';
import logger from '../logger.js';

export function registerSocketHandlers(io: SocketServer): void {
  io.on('connection', (socket: Socket) => {
    const userId = socket.userId;
    const room = `user:${userId}`;

    socket.join(room);
    const request = socket.request as Request;
    const sessionCheck = setInterval(() => {
      request.session.reload((error) => {
        if (
          error ||
          !request.session.authenticated ||
          request.session.userId !== userId
        )
          socket.disconnect(true);
      });
    }, 60_000);
    sessionCheck.unref();
    logger.info({ userId, room }, 'WebSocket: user connected');

    socket.on('disconnect', () => {
      clearInterval(sessionCheck);
      logger.info({ userId }, 'WebSocket: user disconnected');
    });
  });
}
