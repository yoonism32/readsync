import type { NextFunction, Request, Response } from 'express';
import { validationResult } from 'express-validator';
import {
  DEFAULT_PAGE_LIMIT,
  HTTP_BAD_REQUEST,
  MAX_NOVEL_ID_LENGTH,
  MAX_PAGE_LIMIT,
  MIN_PAGE_LIMIT,
} from '../config.js';
import type { AuthenticatedRequest } from '../types/index.js';

/** Send 400 with validation error details if express-validator found issues. */
export function handleValidationErrors(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res
      .status(HTTP_BAD_REQUEST)
      .json({ error: 'Validation failed', errors: errors.array() });
    return;
  }
  next();
}

/** Validate :novelId param length. */
export function validateNovelId(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const { novelId } = req.params;
  if (
    !novelId ||
    typeof novelId !== 'string' ||
    novelId.length > MAX_NOVEL_ID_LENGTH
  ) {
    res.status(HTTP_BAD_REQUEST).json({ error: 'Invalid novel ID format' });
    return;
  }
  next();
}

/** Parse and clamp ?limit and ?offset query params, attach to req.pagination. */
export function validatePagination(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const limit = Math.max(
    MIN_PAGE_LIMIT,
    Math.min(MAX_PAGE_LIMIT, Number(req.query.limit ?? DEFAULT_PAGE_LIMIT)),
  );
  const offset = Math.max(0, Number(req.query.offset ?? 0));
  (req as AuthenticatedRequest).pagination = { limit, offset };
  next();
}
