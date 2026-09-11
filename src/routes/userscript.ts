import { timingSafeEqual } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import { hashApiKey } from '../services/ApiKey.js';

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
export function createUserscriptRouter(
  userscriptPath: string = DEFAULT_USERSCRIPT_PATH,
): Router {
  const router = Router();

  // Tampermonkey/Violentmonkey poll @updateURL from the browser extension
  // itself, outside any readsync session, so this can't require a session —
  // but the built script embeds a live API key (see userscript/src/config.ts),
  // so the URL itself must be unguessable. USERSCRIPT_UPDATE_TOKEN is that
  // secret; it lives in the path (not a `token=` query param) so it doesn't
  // read as "here's a credential" in logs/history.
  router.get('/u/:token/readsync.user.js', (req, res) => {
    const configuredToken = process.env.USERSCRIPT_UPDATE_TOKEN?.trim();
    const matches =
      !!configuredToken &&
      timingSafeEqual(
        Buffer.from(hashApiKey(req.params.token)),
        Buffer.from(hashApiKey(configuredToken)),
      );
    if (!matches) {
      res.status(404).send('Not found');
      return;
    }

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
