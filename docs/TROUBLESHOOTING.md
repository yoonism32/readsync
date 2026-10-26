# Troubleshooting

This page covers symptoms the code actually produces, with their usual
cause. Env vars are explained in [DEPLOYMENT.md](./DEPLOYMENT.md#environment-variables).

## Server won't start

**Symptom:** the process exits with `Missing required environment variables`.

**Cause:** `DATABASE_URL` or `SESSION_SECRET` is unset. Those are the only
two hard requirements (`validateEnvironment()` in `src/config.ts`).

---

**Symptom:** startup fails while connecting to Postgres with a certificate or
TLS error.

**Cause:** for any non-local database, or any database in production, TLS
verification is mandatory (`rejectUnauthorized: true` in `src/db/pool.ts`).

**Fix:** if your provider's chain isn't in Node's trust store, put the CA
certificate (PEM) in `PG_SSL_CA`. Don't disable verification.

---

**Symptom:** startup fails on a migration.

**Cause:** migrations run on every boot. A transactional migration that fails
rolls back completely and the server stops. Read the logged statement, fix
the database state or add a new migration, and restart. Never edit an
applied migration file. See [DATABASE.md](./DATABASE.md).

## Can't log in to the dashboard

**Symptom:** the startup log warns `ADMIN_PASSWORD_HASH not set`.

**Cause:** login is disabled. Generate a hash with
`node generate-password-hash.js <password>` and set it. The
`docker-compose.yml` dev setup ships without one.

---

**Symptom:** `401 Invalid username or password`.

**Cause:** the username must match `ADMIN_USERNAME` (default `admin`) as well
as the password.

---

**Symptom:** `429 Too many login attempts`.

**Cause:** 5 attempts per IP per 15 minutes. Wait for the `Retry-After`
period. The counter is in memory, so a restart also clears it.

---

**Symptom:** `500 Internal server error` on a correct password, and the log
says `Configure ADMIN_USER_ID for an existing unique account`.

**Cause:** the database has more than one user (or none), so the session
can't be bound automatically. Set `ADMIN_USER_ID` to the intended `users.id`.

---

**Symptom:** logged out after a while.

**Cause:** the session cookie lasts 30 days. Logging out in one tab ends
the session for every tab and disconnects its live updates. Login sessions
are stored in Postgres, so they survive restarts and deploys.

## Userscript

**Symptom:** the install/update URL returns `Not found`.

**Cause:** the token in the URL doesn't match `USERSCRIPT_UPDATE_TOKEN`, or
that variable isn't set on the server.

---

**Symptom:** the install/update URL returns `Userscript build not found`.

**Cause:** the token is right, but `dist-userscript/readsync.user.js` wasn't
built. Run `npm run build:all`.

---

**Symptom:** the build throws `Set API_KEY ...` or
`Set USERSCRIPT_UPDATE_TOKEN ...`.

**Cause:** both must be in the build environment or the root `.env`. CI reads
them from repository secrets.

---

**Symptom:** the userscript doesn't run on a page.

**Cause:** the page isn't in the `@match` list. See
[USERSCRIPT.md](./USERSCRIPT.md#supported-sites). NovelPing is matched only
on the bare domain.

---

**Symptom:** progress isn't arriving.

**Cause:** check the browser console on the reading page. A rotated
`API_KEY` means the installed script holds an old key. Reinstall it from the
current build. Failed sends are queued and retried automatically.

## Dashboard isn't updating live

Updates normally arrive over Socket.IO. If the socket can't connect, the
dashboard falls back to polling every 30 minutes. Check these:

- The page origin is in `ALLOWED_ORIGINS`. Socket.IO checks it.
- Your session is still valid. Sockets are rechecked every 60 seconds and
  dropped when the session ends.
- The host supports WebSockets. The CSP allows `wss:`.

## Tests

The four integration test files are skipped unless
`READSYNC_TEST_DATABASE_URL` is set. That variable must point at a
**localhost** database named `readsync_audit`; anything else is refused on
purpose. See [TESTING.md](./TESTING.md).
