# ReadSync — Changelog

## 2026-09-12— Unreleased local audit and product polish

**Status:** implemented in the local workspace; not committed, deployed, or
applied to the production database.

This entry consolidates the security audit, roadmap review, userscript
authentication change, recovery work, and the full Impeccable frontend pass
completed on 2026-09-11–12. It records implementation outcomes, not just
intentions. Browser evidence uses synthetic library data; no production data was
changed.

### At a glance

- Hardened API, session, Socket.IO, PostgreSQL TLS, validation, logging, import,
  export, cover fetching, and migration behavior.
- Restored the owner's preferred userscript workflow: `API_KEY` is embedded at
  build time from the environment, with no userscript key menu or Settings card.
- Reworked all ten non-test frontend pages for clearer information flow,
  stronger teal/crimson hierarchy, responsive layouts, and purposeful motion.
- Fixed Stats device reporting so registered Chrome/Safari devices remain
  visible even when they have no timed sessions in the selected period.
- Added recovery and security regression coverage, plus an opt-in PostgreSQL
  restoration suite.

## Added

### Authentication and account boundaries

- Browser-session authentication is now bound to a specific `users.id` through
  `ADMIN_USER_ID`, with a fail-closed single-user fallback when exactly one
  account exists.
- Login regenerates and saves the session, reserves rate-limit attempts before
  password verification, and redirects successful sign-in to Dashboard.
- Added an optional session-protected API-key issuance endpoint. Issued keys are
  generated randomly, stored only as SHA-256 hashes, and replace/revoke the
  previous issued key.
- Added explicit bearer authentication for the userscript API path while
  retaining legacy body/query credentials temporarily for compatibility with the
  currently deployed server.
- Added token-gated automatic userscript update/download metadata. The route is
  `/u/:token/readsync.user.js`; the token prevents the key-bearing bundle from
  being fetched through a guessable public filename.

### Recovery, migrations, and data integrity

- Added export version 2 with consistent read-only snapshots of novels, metadata,
  devices, progress, bookmarks, notes, categories, sessions, settings, and
  notifications. Credentials and browser sessions are excluded.
- Added atomic, bounded import with validation, batching, stable import
  identities, repeated-restore deduplication, device remapping, and rollback on
  inconsistent input.
- Added migrations 015–018 for revoking published keys/sessions, import identity
  and progress-reset metadata, device ownership constraints, and snapshot write
  timestamps.
- Added transaction-scoped migration bookkeeping and locking, plus narrow fresh
  install repairs for migrations 007 and 010.
- Added an opt-in isolated PostgreSQL recovery suite covering migrations, auth,
  export/restore, repeated import, rollback, progress correction, bulk status,
  ownership, and saved novels without progress.

### Frontend foundations and interaction states

- Added reusable page loading, error, retry, and unavailable-state feedback.
- Added full-effects and browser-saved Quiet modes. Full effects are the default
  requested experience; Quiet suppresses spatial and entrance motion.
- Added responsive page-signature styling, visible keyboard focus, themed
  placeholders/carets, minimum touch targets, animated active navigation, and
  teal secondary accents.
- Added a Dashboard resume card with cover depth, bookmark entrance, chapter
  position, and a prominent Continue action.

## Changed

### Security and transport

- All `/api/v1` requests authenticate before general body parsing; imports use a
  larger parser only after dashboard-session authentication succeeds.
- Added request limits for API traffic, login attempts, imports, backups, and
  key issuance. Limits are intentionally in-process/IP-scoped for the current
  single-process deployment.
- Added production-only trusted-proxy handling, security headers, CSP,
  referrer policy, frame protection, and HSTS.
- PostgreSQL connections now require certificate verification, optionally using
  `PG_SSL_CA`; connection-string flags cannot weaken configured verification.
- Socket.IO now validates origin/fetch metadata, binds sockets to sessions and
  user rooms, periodically revalidates sessions, and disconnects sockets on
  logout. Arbitrary novel-room subscriptions were removed.
- Structured logs redact credential-like fields, and production alerts omit raw
  exception details.

### Userscript and synchronization

- Updated the userscript and package metadata to version 5.8.1.
- The build reads `API_KEY` and `USERSCRIPT_UPDATE_TOKEN` from the root
  environment and injects them into the generated userscript metadata/runtime.
- Offline queue entries no longer retain credentials. Authentication, rate-limit,
  and server failures remain queued for retry; permanent client failures are
  classified separately.
- Added navigation-generation guards so stale progress/compare responses cannot
  update the wrong novel after SPA route changes.
- Library loading now follows every API page instead of silently stopping at the
  first page. Socket updates patch normal progress locally and coalesce refetches
  for reconnects, new novels, and relevant metadata changes.
- Cover fetching now has timeouts, redirect rejection, a 5 MiB streamed cap,
  20-megapixel decode protection, bounded concurrency, per-slug exclusion,
  cooldowns, and storage-origin/path validation.

### Reading and library correctness

- First-read novel insertion is safe under concurrent requests.
- Manual corrections and completion snapshots use per-user synthetic devices;
  completion creates its device before dependent progress writes.
- Single and bulk status changes share completion/history behavior and validate
  bounded batches transactionally.
- Manual downward corrections create a progress-reset cutoff without deleting
  history. The cutoff now applies consistently to global/device progress and
  reread/completion calculations.
- Metadata is locked during corrections and rereads; chapter and percentage
  values come from the same furthest-progress row.
- Saved novels without progress are included in library results, with stable
  secondary ordering. Hard deletion now covers remaining user-owned notes,
  category assignments, and notifications.

### Frontend page flow and visual system

The existing editorial dark/crimson identity, fonts, reading workflows, and My
List title-width experiment were preserved. The page-specific changes are:

| Page | Changelog entry |
| --- | --- |
| Dashboard | Dashboard is the post-login destination and appears before My List. The resume card comes first, the activity heatmap follows it, and Currently reading comes before lower summaries. Heatmap mobile containment, DST-safe date keys, request recovery, and honest unknown-streak states were added. |
| Explorer | Replaced nested genre/status dropdowns with visible filter chips, teal include/red exclude states, Match all/Match any controls, an explicit Any status state, a secondary filter grid, named search, clear-filter recovery, responsive results, and one page-level relative-time clock. |
| History | Added full accessible names to date ranges, brighter selected-range text, wrapping device badges, consistent headings, and usable targets. |
| Login | Added teal brand detailing, direct password labeling, accessible error/busy states, duplicate-submit protection, username no-capitalization behavior, and Dashboard redirect. |
| Manage | Added library-load recovery, trimmed title search, novel-specific removal confirmation, and stronger status/removal controls. |
| My List | Added load/error distinction, named search, keyboard status-tab navigation, linked result-panel semantics, table caption/scroll region, bulk-action feedback, and page-aware selection behavior. |
| Novel | Added distinct loading/error/missing states, synopsis retry, favorite pending/pressed feedback, mobile cover/title stacking, tokenized cover surfaces, and wrapping device rows. |
| Settings | Added explicit preference/backup/library/refresh states, prevented unloaded defaults, guarded notification activation, refreshed caches after import, and improved narrow sections. The userscript installation/key card remains removed. |
| Stats | Fixed registered-device visibility, added the zero-session regression test, replaced weak ghost fills with solid teal tracks, clarified no-device versus no-session states, added independent chart recovery, fixed narrow-grid overflow, reduced hourly label density, added accessible chart values, and corrected duration rounding. |
| Admin | Standardized heading/panel spacing, bounded explanatory text, and preserved the truthful local-only bot state. |

### Design and performance decisions

- Full effects are intentionally the default for this single owner's requested
  experience; Quiet is opt-in and saved per browser.
- Routine page/list entrances were removed where they distracted from reading;
  motion remains on meaningful transitions such as cover depth, active navigation,
  chart growth, disclosure, progress, and pressed feedback.
- Stats decorative count-up work was removed. The recorded Stats JavaScript
  comparison fell from 16,466 to 15,869 bytes, with gzip falling from 4,705 to
  4,442 bytes. This is not a claim of an overall Core Web Vitals improvement.
- The final checked accent pairs were selected control 4.92:1, active navigation
  approximately 5.39:1, and muted text on canvas 6.85:1.

## Fixed

|- Fixed Stats reporting that incorrectly implied there was no device data when
  devices existed in the database but had no completed sessions in the selected
  window.

- Fixed activity heatmap duplicate date keys around daylight-saving transitions.
- Fixed the Stats layout stretching a 375px viewport to 660px.
- Fixed duration rounding that could display values such as `1h 60m`.
- Fixed My List's header checkbox showing an indeterminate state when selected
  novels existed only on another page.
- Fixed My List bulk actions so a failed follow-up revalidation reports clearly
  without hiding already-settled server writes.
- Fixed stale documentation that still described userscript 5.8.0, Settings-issued
  keys as the current workflow, disabled rate limiting, and `API_KEY` as dead
  configuration.

## Security trade-off recorded by owner request

The generated version 5.8.1 userscript embeds `API_KEY` in plaintext because the
owner is the sole user and wants the older personalized `.js` workflow. Anyone
who obtains the bundle can use that user's API access. This is deliberate and
documented, not treated as a secret-safe distribution model.

The risk is reduced but not eliminated by:

- the token-gated update/download route;
- environment-based rebuilds after key rotation;
- backend binding to `ADMIN_USER_ID` or the sole database user;
- hashed storage for optional database-issued keys;
- rate limits and request validation; and
- migration 015 revoking old published database keys and pre-binding sessions.

Legacy body/query credentials remain only for compatibility with the currently
deployed server and may appear in request logs. The updated backend and
userscript should be deployed together before removing that compatibility path.

## Verification

### Passed locally on 2026-09-12

- 300 non-listening backend/userscript tests passed.
- 96 frontend tests passed across 15 test files.
- Frontend lint passed.
- Backend TypeScript typecheck and Biome checks passed.
- Frontend TypeScript/build passed.
- Userscript 5.8.1 build passed; the generated artifact contains an auth header,
  no configuration menu, and no unresolved key placeholder.
- `git diff --check` passed.
- CSS brace validation passed for all imported frontend stylesheets.
- Existing browser pass: 44 assertions across desktop/mobile layout, keyboard
  filters, chart controls, and failed-request recovery; all ten pages were also
  checked at 320px, 375px, and 1440px with synthetic data.
- Existing Impeccable source detector returned no findings.

### Environment-limited

- Eight opt-in PostgreSQL tests were skipped in the ordinary run. The isolated
  recovery suite had passed previously against a disposable local PostgreSQL
  database; it must be rerun before release if the environment is available.
- Ten tests in four route suites could not bind temporary loopback listeners in
  the restricted execution environment (`EPERM`). The attempted permission
  escalation was unavailable because the account usage limit had been reached.

## Release blockers and remaining work

- Commit or publish the local changes.
- Back up production and deploy the coordinated server, SPA, userscript 5.8.1,
  and migrations 015–018.
- Verify production user binding, PostgreSQL TLS, key rotation, login/logout,
  cross-device progress, and export/restore.
- Review historical device-owner mismatches before validating migration 017's
  constraints against old records.
- Verify real webhook delivery and provider quota/egress monitoring.
- Check real-account content, Safari/Firefox, and assistive-technology behavior.

## Related documentation

- [Security remediation and release checklist](./SECURITY-REMEDIATION-2026-09-11.md)
- [Frontend page audit and polish report](./IMPECCABLE-PAGES-AUDIT-2026-09-11.md)
- [Roadmap](./ROADMAP.md)
- [API reference](./API_REFERENCE.md)
- [Architecture](./ARCHITECTURE.md)
