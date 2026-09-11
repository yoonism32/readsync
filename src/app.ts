import { createServer } from 'node:http';
import path from 'node:path';
import compression from 'compression';
import connectPgSimple from 'connect-pg-simple';
import cors from 'cors';
import express from 'express';
import { rateLimit } from 'express-rate-limit';
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
import {
  requireAuth,
  requireAuthAPI,
  validateApiKey,
} from './middleware/auth.js';
import { globalErrorHandler } from './middleware/errorHandler.js';
import { normalizeBody } from './middleware/normalizeBody.js';
import { createAdminRouter } from './routes/admin.js';
import authRouter from './routes/auth.js';
import backupsRouter from './routes/backups.js';
import bookmarksRouter from './routes/bookmarks.js';
import categoriesRouter from './routes/categories.js';
import coversRouter from './routes/covers.js';
import devicesRouter from './routes/devices.js';
import historyRouter from './routes/history.js';
import notesRouter from './routes/notes.js';
import notificationsRouter from './routes/notifications.js';
import novelsRouter from './routes/novels.js';
import { createProgressRouter } from './routes/progress.js';
import sessionsRouter from './routes/sessions.js';
import settingsRouter from './routes/settings.js';
import statsRouter from './routes/stats.js';
import userscriptRouter from './routes/userscript.js';
import { READER_HOSTS } from './services/ReaderUrl.js';
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
  app.set('trust proxy', IS_PRODUCTION ? 1 : false);
  app.disable('x-powered-by');
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
  app.use(
    cors({
      origin: [
        ...ALLOWED_ORIGINS,
        ...READER_HOSTS.flatMap((host) => [
          `https://${host}`,
          `https://www.${host}`,
        ]),
      ],
      credentials: true,
    }),
  );
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data:; connect-src 'self' wss:; font-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
    );
    if (IS_PRODUCTION)
      res.setHeader('Strict-Transport-Security', 'max-age=31536000');
    next();
  });
  app.use(
    '/api',
    rateLimit({
      windowMs: 60_000,
      limit: 600,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
    }),
    (_req, res, next) => {
      res.setHeader('Cache-Control', 'no-store');
      next();
    },
  );
  app.use(
    ['/api/v1/import', '/api/v1/backups/run', '/api/auth/api-key'],
    rateLimit({
      windowMs: 60_000,
      limit: 5,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
    }),
  );

  // Without a store, express-session uses MemoryStore: sessions live in the
  // process heap, so every deploy and every free-tier hibernation logs everyone
  // out. Because requireAuthAPI accepts only req.session.authenticated, that
  // surfaced as the app serving pages while every API call returned 401.
  // Reusing the existing pool keeps this to one connection source.
  const PgSession = connectPgSimple(session);

  const sessionMiddleware = session({
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
  });
  app.use(sessionMiddleware);
  app.use('/api/v1', validateApiKey);
  const jsonParser = express.json({ limit: JSON_BODY_LIMIT });
  app.use((req, res, next) =>
    req.path === '/api/v1/import' ? next() : jsonParser(req, res, next),
  );
  app.use(express.urlencoded({ extended: true }));
  // Must follow the parsers: restores the Express 4 `{}` default the routes assume.
  app.use(normalizeBody);
  app.use('/api/v1/import', requireAuthAPI, express.json({ limit: '100mb' }));
  io.engine.use(sessionMiddleware);
  io.on('connection', (socket) => {
    const request = socket.request as express.Request;
    if (request.sessionID) socket.join(`session:${request.sessionID}`);
  });
  app.use('/api/auth/logout', (req, _res, next) => {
    io.in(`session:${req.sessionID}`).disconnectSockets(true);
    next();
  });

  // ── Static files ─────────────────────────────────────────────────────────────

  // Hashed assets (JS/CSS bundles from Vite) → 1 year immutable
  app.use(
    '/app/assets',
    express.static(path.join(PUBLIC_DIR, 'app', 'assets'), {
      maxAge: '1y',
      immutable: true,
    }),
  );

  // All other static files → 1 day with revalidation
  app.get('/practice.html', requireAuth, (_req, res) =>
    res.status(410).send('The legacy API explorer has been retired.'),
  );
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
  app.use(createAdminRouter(io));
  app.use(userscriptRouter);

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
