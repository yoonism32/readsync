# Security policy

ReadSync stores reading history behind a dashboard login and an API key, so
security reports are welcome and taken seriously.

## Supported versions

Only the current `main` branch and the instance deployed from it are
supported. There are no maintained release branches.

## Reporting a vulnerability

Please **do not open a public issue** for a security problem.

Use GitHub's private reporting instead: on the repository page, go to
**Security → Report a vulnerability**. That opens a private advisory visible
only to the maintainer.

Include what you can of:

- the affected route, page or file;
- steps to reproduce, or a proof of concept;
- what an attacker gains (data read, data changed, privilege, availability).

You can expect an acknowledgement within a week. Fixes are shipped on `main`
and deployed; the advisory is published once the fix is live.

## Scope

In scope:

- Authentication and sessions (`/api/auth/*`, dashboard login, Socket.IO auth)
- API key handling and the `/api/v1/*` authorization boundary
- The gated userscript route `/u/:token/readsync.user.js`
- Data import/export and backups
- CORS, CSP and other response headers
- Database access rules (row-level security, grants)

Out of scope:

- The third-party reading sites the userscript runs on
- Denial of service through sheer request volume
- Findings that need a compromised device, browser extension or
  userscript manager
- Missing hardening headers with no demonstrated impact

## How the app is protected

A summary, so reporters know what is intentional. Details live in
[docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) and
[docs/API_REFERENCE.md](./docs/API_REFERENCE.md).

- **Dashboard login.** `POST /api/auth/login` checks `ADMIN_USERNAME` and a
  bcrypt `ADMIN_PASSWORD_HASH`. It regenerates the session on success and
  allows 5 attempts per IP per 15 minutes.
- **Sessions.** They are stored in Postgres (`connect-pg-simple`). The cookie
  is `httpOnly`, `sameSite=strict` and `secure` in production, and lasts 30 days. Logout destroys the session
  and disconnects its sockets.
- **API keys.** Clients send `Authorization: Bearer <key>`. The environment
  key is compared timing-safely, on hashes. Keys issued through the API are
  stored only as SHA-256 hashes. Issuing a new key revokes the old one.
- **Authorization.** Every `/api/v1` route requires a bound session or a
  valid key. Data is scoped to the authenticated user. Device writes enforce
  ownership.
- **Rate limits.** These run in-process:
  - `/api/*`: 600 requests per minute;
  - import, backup run and key issue: 5 per minute;
  - login: the limiter above.
- **Headers.** CSP with `default-src 'self'` and `frame-ancestors 'none'`.
  Also `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy: no-referrer`,
  and HSTS in production.
- **Database.**
  - Migration 007 enables row-level security on every public table with no
    policies, and revokes Supabase's `anon` and `authenticated` grants. Only
    the server's own connection can read or write.
  - Remote Postgres TLS is verified (`PG_SSL_CA`).
- **Request bodies.** JSON is capped at 10 MB. Import is capped at 20 MB and
  is parsed only after authentication.

## Notes for operators

- **The built userscript contains the live `API_KEY`.** That is why it is
  served only at a URL containing the secret `USERSCRIPT_UPDATE_TOKEN`. Treat
  both as one credential: if either leaks, rotate `API_KEY`, set a new token,
  rebuild and redeploy, then reinstall the userscript from the new URL.
- `node generate-password-hash.js <password>` takes the password as an
  argument, so it lands in your shell history. Start the command with a space
  (with `HISTCONTROL=ignorespace`) or clear the history entry afterwards.
- Secrets belong in the host's environment settings (Render dashboard),
  a local `.env` (gitignored) and GitHub Actions secrets. They never belong in
  the repository. `.env.example` lists the variable names only.

## History

Past reviews and their fixes are kept as dated records:

- [docs/SECURITY-AUDIT-2026-09-09.md](./docs/SECURITY-AUDIT-2026-09-09.md)
- [docs/SECURITY-REMEDIATION-2026-09-11.md](./docs/SECURITY-REMEDIATION-2026-09-11.md)
