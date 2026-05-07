import type { Socket, Server as SocketServer } from 'socket.io';
import logger from '../logger.js';

export function registerSocketHandlers(io: SocketServer): void {
  io.on('connection', (socket: Socket) => {
    const userId = socket.userId;
    const room = `user:${userId}`;

    socket.join(room);
    logger.info({ userId, room }, 'WebSocket: user connected');

    socket.on('disconnect', () => {
      logger.info({ userId }, 'WebSocket: user disconnected');
    });

    socket.on('subscribe:novel', (novelId: string) => {
      socket.join(`novel:${novelId}`);
    });

    socket.on('unsubscribe:novel', (novelId: string) => {
      socket.leave(`novel:${novelId}`);
    });
  });
}
