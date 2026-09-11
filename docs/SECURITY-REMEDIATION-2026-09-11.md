# Audit remediation — 2026-09-11

Status: implemented locally, pending production rollout. Existing My List changes
were preserved. No live database or external monitoring configuration was changed.

Owner-approved exception (5.8.1): the build embeds API_KEY from the root .env or
build environment in the publicly downloadable userscript. There is no key menu
or Settings-generated key step. Public automatic update metadata remains intact.
Anyone downloading the script can obtain the key and use that user's API access.
Legacy body/query credentials accompany Bearer headers for the old production
server; query keys may appear in request logs. Rebuild after rotating API_KEY.
The updated backend binds this key to ADMIN_USER_ID or the sole database user.
These decisions supersede earlier key-free/public-bundle recommendations below.

## Implemented changes

| Area | Result |
| --- | --- |
| Credentials | Version 5.8.1 embeds API_KEY by owner request; no configuration menu. Bearer plus legacy body/query credentials. |
| Dashboard authentication | Uses HttpOnly sessions bound to a users.id. Login regenerates and saves sessions; ambiguous multi-user configuration fails closed. Logout clears client caches and disconnects sockets sharing that session. |
| Key lifecycle | Environment key is rebuilt into the script when changed. Optional API-issued keys remain hashed in the database. Migration 015 revokes old database keys and sessions, not the environment key. |
| Authorization | Global stale reports require dashboard login. Auto-updates require library membership. Device upserts enforce ownership; composite foreign keys protect new progress/session writes. |
| Transport and requests | Remote PostgreSQL TLS is verified. API rate limits, reserved login attempts, security headers, bounded validation and authentication before large body parsing are enabled. |
| Images | Upstream downloads have timeouts, blocked redirects and a 5 MiB cap. Decoding is limited to 20 MP. Mirroring is limited to four concurrent operations with per-slug exclusion and cooldown. Storage URLs must match the configured origin. |
| Reading correctness | Downward manual corrections establish a cutoff without deleting history. Rereads lock metadata. Single/bulk status changes share completion/history behavior and per-user synthetic devices. |
| Recovery | Export v2 captures all user collections consistently, retaining timestamp precision. Import validates, batches, maps device ownership, deduplicates and rolls back atomically. Credentials and browser sessions are excluded. |
| Client reliability | Offline queues preserve concurrent enqueues and retry authentication/rate-limit failures. Navigation guards discard stale UI effects. Larger libraries load all pages; reconnects and new novels trigger refetches while normal progress patches locally. |
| Operations | Tests cannot load .env secrets. Blank alert limits use defaults, dedup entries expire, production alerts omit raw error details, and Slack/Discord receive their expected envelopes. Transactional migration records commit with their DDL. |

## Release checklist

1. Take a database-level backup. Pre-v2 JSON exports contain only the data their
   original exporter included; missing historical records cannot be reconstructed.
2. Confirm ADMIN_USER_ID names the intended existing user. It is mandatory when
   multiple users exist; exactly one user may be selected automatically. Verify
   the remote database certificate chain; supply PG_SSL_CA as PEM if required.
3. Deploy server, SPA, userscript 5.8.1 and migrations 015–018 together. Migration
   015 intentionally signs users out and revokes old database keys. Rebuild the
   userscript with the rotated `API_KEY`; there is no Settings key card or manager
   configuration step in the current owner-approved flow.
4. Verify deployed login/logout, key rotation, cross-device progress, covers,
   a fresh export/restore and actual webhook delivery. Do not roll back to or
   republish the old userscript containing a credential.
5. Review historical ownership mismatches before validating the NOT VALID foreign
   keys introduced by 017. They enforce new writes immediately; old records are
   deliberately not deleted or reassigned. Inspect progress_snapshots and
   reading_sessions joined to devices where user_id differs.
6. Inspect provider usage/egress and configure a quota alarm separately. Runtime
   exception alerts cannot detect a successful but expensive query or quota breach.

## Compatibility and operating limits

- REST clients use `Authorization: Bearer <key>`; body/query keys are rejected.
  The SPA and Socket.IO use browser sessions. Each user currently has one active
  userscript key; replacing it requires updating their other installations.
- Limits are per process/IP: 600 API requests/minute and five costly restore,
  backup or key-issuance requests/minute. Login has a stricter five-attempt limit.
  Multiple app instances would need shared rate-limit state. Production assumes
  Render's single trusted proxy hop; development trusts no proxy.
- Restore requires dashboard login and accepts at most 100 MiB and 500,000 records
  per collection. Larger archives require a streaming restore workflow. Metadata
  and settings are merged from the chosen archive; unrelated records remain.
- Migrations 007 and 010 received narrow fresh-install repairs for missing
  Supabase roles/functions and a legacy-only table. Already-applied installations
  do not replay them. This is an exception to the usual immutable migration rule.
- Legacy CONCURRENTLY index migrations still require a single migration runner.
  Transactional migrations use transaction-scoped locks compatible with the
  transaction pooler; no session-scoped advisory locks were introduced.
- Old secrets remain in Git history but are revoked by migration 015 on rollout.
  History was not rewritten and unrelated local secrets were not rotated.

## Verification

The historical 2026-09-11 verification passed the full local command (301
backend/userscript tests, 93 frontend tests, typecheck, formatting/lint, SPA and
userscript builds). The eight opt-in PostgreSQL tests also passed separately,
including saved novels with no progress. During the 2026-09-12 diff
reconciliation, 300 non-listening backend/userscript tests and 96 frontend tests
passed; four route suites containing 10 tests could not bind temporary listeners
in the restricted sandbox. Userscript standalone typechecking and
`git diff --check` also passed.

Run `npm run verify` for regression tests, typecheck, formatting/lint and builds.
The opt-in PostgreSQL integration suite tests migrations, session/key behavior,
backup round-trips, repeated import, rollback, correction, bulk completion and
ownership against an isolated database. Set READSYNC_TEST_DATABASE_URL to a
disposable localhost database named readsync_audit; other hosts/names are rejected.
It must never point to production.

Production TLS, quota metrics and webhook delivery require the release checks
above. Local test success is not evidence that those external checks have run.
