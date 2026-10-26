# Userscript

The userscript is the reading-side client. It runs on supported web-novel
pages and tracks your scroll position. It sends progress to the ReadSync API,
and the dashboard picks that up live. Source is in `userscript/`; the
version is in `userscript/package.json` (currently 5.9.1).

## Install

1. Install a userscript manager: **Tampermonkey** or **Violentmonkey**. Any
   manager that supports `GM_xmlhttpRequest` should also work.
2. Open the gated install URL in that browser:

   ```text
   https://<your-readsync-host>/u/<USERSCRIPT_UPDATE_TOKEN>/readsync.user.js
   ```

   The manager detects the `.user.js` file and offers to install it. There is
   no install button in the dashboard. You need the token from the server's
   environment.

**Treat the install URL as a secret.** The built file contains the
deployment's `API_KEY` (see [SECURITY.md](../SECURITY.md#notes-for-operators)).

## Updates

The built header sets both `@updateURL` and `@downloadURL` to the same gated
URL. To ship an update:

1. Bump `version` in `userscript/package.json`.
2. Redeploy. The build regenerates `dist-userscript/readsync.user.js`.
3. Managers notice the higher `@version` on their next check. The route sends
   `Cache-Control: no-cache`, so nothing stale is served.

If you rotate `USERSCRIPT_UPDATE_TOKEN`, the old URL starts returning 404.
Installed copies stop updating until you reinstall from the new URL.

## Supported sites

`@match` patterns are in `userscript/vite.config.ts`.

| Site | Pages |
|---|---|
| NovelPing (current) | `novelping.com/novel/*`, `novelping.com/book/*` (bare domain; `www.` redirects there) |
| NovelArrow (legacy) | `/novel/*` and `/chapter/*/*`, with or without `www.` |
| NovelBin (legacy) | `.com`, `.me`, `.net`, `.org` under `/b/*`, with or without `www.` |

The server accepts the same hosts (`READER_HOSTS` in
`src/services/ReaderUrl.ts`). Old NovelArrow/NovelBin links stored in the
database are rewritten to NovelPing when read. See
[NOVELPING_MIGRATION.md](./NOVELPING_MIGRATION.md).

## What it does on a page

- Saves your maximum scroll progress per chapter and syncs it across
  devices. Failed sends are queued offline and retried.
- Shows a progress bar and a restore banner, and supports `#nbp=<percent>`
  resume links.
- Keyboard: `A`/`D` previous/next chapter, `W`/`S` scroll, `Shift+S`
  autoscroll, `Shift+H` help.
- On novel pages, reads metadata and uploads the cover. That uses
  `GM_xmlhttpRequest`, limited by `@connect` to `images.novelping.com` and
  `images.novelarrow.com`.

## Build

```bash
npm run build --prefix userscript   # or: npm run build:all
```

- Output: `dist-userscript/readsync.user.js`. It's a single IIFE, not
  minified, and gitignored.
- **Required at build time:** `API_KEY` and `USERSCRIPT_UPDATE_TOKEN`, read
  from the environment or the root `.env`. The build throws if either is
  missing. The key is embedded; the token goes into `@updateURL`.
- The API base URL and the update-URL origin are hard-coded to the
  production Render host, in `userscript/src/config.ts` and
  `userscript/vite.config.ts`. For local testing, edit `READSYNC_API_BASE`
  and don't commit the change.
- `npm run dev --prefix userscript` rebuilds on change (`vite build --watch`).

Tests for the userscript live in `userscript/__tests__/` (and the
ChapterDetector ones in `__tests__/regression/`). They run with the root
`npm test`. See [TESTING.md](./TESTING.md).
