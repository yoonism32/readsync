import type { NextFunction, Request, Response } from 'express';

/**
 * Guarantee `req.body` is an object.
 *
 * Express 4 always handed routes a `{}` when nothing was parsed. Express 5
 * leaves `req.body` as `undefined` whenever no body parser matched — a bodyless
 * DELETE, or a request whose Content-Type claims JSON but carries zero bytes,
 * which is exactly what the frontend's `request()` helper sends since it sets
 * the JSON header unconditionally.
 *
 * Every route here destructures the body directly on the Express 4 assumption:
 *
 *   const { hard = false } = req.body as { hard?: boolean };
 *
 * With `req.body` undefined that throws a TypeError *before* the route's own
 * try/catch, so it never reaches handleDbError and surfaces as an opaque 500
 * (this is what broke DELETE /api/v1/novels/:novelId for every novel).
 * Normalising once here is safer than guarding each of the ~19 call sites and
 * keeps the next route that destructures a body from reintroducing it.
 */
export function normalizeBody(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  if (req.body === undefined) req.body = {};
  next();
}
