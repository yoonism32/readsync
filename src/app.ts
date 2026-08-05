import { createServer } from 'node:http';
import path from 'node:path';
import compression from 'compression';
import connectPgSimple from 'connect-pg-simple';
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
import { normalizeBody } from './middleware/normalizeBody.js';
import adminRouter from './routes/admin.js';
import authRouter from './routes/auth.js';
import bookmarksRouter from './routes/bookmarks.js';
import coversRouter from './routes/covers.js';
import devicesRouter from './routes/devices.js';
import backupsRouter from './routes/backups.js';
import categoriesRouter from './routes/categories.js';
import historyRouter from './routes/history.js';
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
  // Must follow the parsers: restores the Express 4 `{}` default the routes assume.
  app.use(normalizeBody);

  // Without a store, express-session uses MemoryStore: sessions live in the
  // process heap, so every deploy and every free-tier hibernation logs everyone
  // out. Because requireAuthAPI accepts only req.session.authenticated, that
  // surfaced as the app serving pages while every API call returned 401.
  // Reusing the existing pool keeps this to one connection source.
  const PgSession = connectPgSimple(session);

  app.use(
    session({
      store: new PgSession({
        pool,
        tableName: 'session',
        // Migration 009 owns the schema — no DDL at request time.
        createTableIfMissing: false,
        // Sweep expired rows every 15 minutes (seconds here, not ms).
        pruneSessionInterval: 15 * 60,
      }),
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
  app.use(categoriesRouter);
  app.use(historyRouter);
  app.use(backupsRouter);
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
