import { createServer } from 'node:http';
import path from 'node:path';
import compression from 'compression';
import cors from 'cors';
import express from 'express';
import session from 'express-session';
import { Server as SocketServer } from 'socket.io';

import {
  ALLOWED_ORIGINS,
  IS_PRODUCTION,
  JSON_BODY_LIMIT,
  SESSION_MAX_AGE_MS,
  SESSION_SECRET,
} from './config.js';
import pool from './db/pool.js';
import { globalErrorHandler } from './middleware/errorHandler.js';
import adminRouter from './routes/admin.js';
import authRouter from './routes/auth.js';
import bookmarksRouter from './routes/bookmarks.js';
import coversRouter from './routes/covers.js';
import devicesRouter from './routes/devices.js';
import notesRouter from './routes/notes.js';
import notificationsRouter from './routes/notifications.js';
import novelsRouter from './routes/novels.js';
import { createProgressRouter } from './routes/progress.js';
import sessionsRouter from './routes/sessions.js';
import settingsRouter from './routes/settings.js';
import statsRouter from './routes/stats.js';
import { authenticateSocket } from './websocket/auth.js';
import { registerSocketHandlers } from './websocket/handlers.js';

const PUBLIC_DIR = path.join(__dirname, '..', 'public');

export function createApp(): {
  app: express.Application;
  httpServer: ReturnType<typeof createServer>;
  io: SocketServer;
} {
  const app = express();
  // Behind Render's TLS-terminating proxy: required for secure session
  // cookies to be set and for req.ip to reflect the real client address.
  app.set('trust proxy', 1);
  const httpServer = createServer(app);

  const io = new SocketServer(httpServer, {
    cors: {
      origin: ALLOWED_ORIGINS,
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  // ── Middleware ───────────────────────────────────────────────────────────────

  app.use(compression());
  app.use(cors({ origin: ALLOWED_ORIGINS, credentials: true }));
  app.use(express.json({ limit: JSON_BODY_LIMIT }));
  app.use(express.urlencoded({ extended: true }));

  app.use(
    session({
      secret: SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: IS_PRODUCTION,
        httpOnly: true,
        sameSite: 'strict',
        maxAge: SESSION_MAX_AGE_MS,
      },
    }),
  );

  // ── Static files ─────────────────────────────────────────────────────────────

  // Hashed assets (JS/CSS bundles from Vite) → 1 year immutable
  app.use('/app/assets', express.static(path.join(PUBLIC_DIR, 'app', 'assets'), {
    maxAge: '1y',
    immutable: true,
  }));

  // All other static files → 1 day with revalidation
  app.use(express.static(PUBLIC_DIR, { maxAge: '1d' }));

  // ── Health check ─────────────────────────────────────────────────────────────

  app.get('/health', async (_req, res) => {
    let dbStatus: 'ok' | 'error' = 'ok';
    try {
      await pool.query('SELECT 1');
    } catch {
      dbStatus = 'error';
    }

    const healthy = dbStatus === 'ok';
    res.status(healthy ? 200 : 503).json({
      status: healthy ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()),
      checks: { database: dbStatus },
    });
  });

  // ── Routes ───────────────────────────────────────────────────────────────────

  // Rate limiting DISABLED for personal use:
  // app.use('/api/v1/', apiLimiter);

  app.use(authRouter);
  app.use(createProgressRouter(io));
  app.use(novelsRouter);
  app.use(devicesRouter);
  app.use(bookmarksRouter);
  app.use(sessionsRouter);
  app.use(notesRouter);
  app.use(notificationsRouter);
  app.use(statsRouter);
  app.use(settingsRouter);
  app.use(coversRouter);
  app.use(adminRouter);

  // ── SPA catch-all (React app at /app/*) ──────────────────────────────────────

  app.get('/app/*splat', (_req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, 'app', 'index.html'));
  });

  // ── Error handler ─────────────────────────────────────────────────────────────

  app.use(globalErrorHandler);

  // ── WebSocket ─────────────────────────────────────────────────────────────────

  io.use((socket, next) => {
    void authenticateSocket(socket, next);
  });
  registerSocketHandlers(io);

  return { app, httpServer, io };
}
