import type { NextFunction, Request, Response } from 'express';
import {
  HTTP_BAD_REQUEST,
  HTTP_CONFLICT,
  HTTP_INTERNAL_ERROR,
  IS_PRODUCTION,
} from '../config.js';
import logger from '../logger.js';
import { notify } from '../services/Alerter.js';

interface PgError extends Error {
  code?: string;
}

/** Maps PostgreSQL error codes to HTTP responses. */
export function handleDbError(
  res: Response,
  error: unknown,
  operation: string,
): void {
  logger.error({ error, operation }, 'Database error');
  notify(error, { operation: `db:${operation}` });

  const pg = error as PgError;
  switch (pg.code) {
    case '23503':
      res
        .status(HTTP_BAD_REQUEST)
        .json({ error: 'Referenced record not found' });
      return;
    case '23505':
      res.status(HTTP_CONFLICT).json({ error: 'Duplicate entry' });
      return;
    case '23514':
      res
        .status(HTTP_BAD_REQUEST)
        .json({ error: 'Check constraint violation' });
      return;
    default:
      res.status(HTTP_INTERNAL_ERROR).json({
        error: 'Database error',
        detail: IS_PRODUCTION ? 'Internal server error' : pg.message,
      });
  }
}

/** Express global error handler — catches anything thrown or passed to next(err). */
export function globalErrorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  logger.error({ err }, 'Unhandled error');
  notify(err, {
    operation: 'http:unhandled',
    method: req.method,
    path: req.path,
  });
  res.status(HTTP_INTERNAL_ERROR).json({
    error: IS_PRODUCTION ? 'Internal server error' : err.message,
  });
}
