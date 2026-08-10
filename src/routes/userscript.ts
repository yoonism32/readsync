import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';

const DEFAULT_USERSCRIPT_PATH = path.join(
  __dirname,
  '..',
  '..',
  'dist-userscript',
  'readsync.user.js',
);

// Factory (not a bare default export) so tests can point it at a fixture
// instead of the real build artifact — see createProgressRouter for the
// same pattern.
export function createUserscriptRouter(userscriptPath: string = DEFAULT_USERSCRIPT_PATH): Router {
  const router = Router();

  // No auth: Tampermonkey/Violentmonkey poll @updateURL from the browser
  // extension itself, outside any readsync session, so this must be public.
  router.get('/readsync.user.js', (_req, res) => {
    if (!fs.existsSync(userscriptPath)) {
      res.status(404).send('Userscript build not found');
      return;
    }

    res.set('Content-Type', 'text/javascript; charset=utf-8');
    // Managers re-check this URL for @version bumps; caching would delay them seeing one.
    res.set('Cache-Control', 'no-cache');
    // userscriptPath is a fixed server-side constant, never derived from the
    // request, so allowing dotfiles carries no traversal risk — needed
    // because sendFile's default policy 404s on any hidden path segment.
    res.sendFile(userscriptPath, { dotfiles: 'allow' });
  });

  return router;
}

export default createUserscriptRouter();
