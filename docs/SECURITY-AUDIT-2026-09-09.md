# Security and code audit - 2026-09-09

This audit covers the ReadSync backend, frontend, userscript, database access,
authentication, authorization, input validation, and runtime dependencies at
commit `678af0e`.

## Findings

### 1. Critical: live API credential is committed and shipped

- **Location:** [userscript/src/config.ts](../userscript/src/config.ts#L70-L74)
- **Impact:** The distributed userscript contains a live API key. Anyone who
downloads the userscript can impersonate that account and call authenticated
API routes.
- **Remediation:** Revoke and rotate the exposed key immediately. Replace the
shared embedded credential with user-scoped, revocable authentication. Do not
commit replacement secrets to the repository or generated artifacts.

### 2. High: PostgreSQL TLS certificate verification is disabled

- **Location:** [src/db/pool.ts](../src/db/pool.ts#L12-L27)
- **Impact:** The connection explicitly uses `sslmode=no-verify` and
`rejectUnauthorized: false`. A network intermediary can impersonate the
PostgreSQL server, capture credentials, or modify application data.
- **Remediation:** Require certificate verification and configure the trusted
CA supplied by the database provider.

### 3. High: admin and global mutation routes accept any API key

- **Location:** [src/routes/admin.ts](../src/routes/admin.ts#L32-L62) and
[src/routes/admin.ts](../src/routes/admin.ts#L78-L80)
- **Impact:** Any valid API-key holder can enumerate stale novels and activity
across users. The auto-update endpoint can modify global novel metadata without
checking that the novel belongs to the authenticated user or that the caller
has an admin role.
- **Remediation:** Add explicit admin authorization for the stale report and
admin-only mutations. For userscript-facing updates, enforce ownership or a
separate narrowly scoped permission.

### 4. High: device ownership is not enforced during progress upsert

- **Location:** [src/routes/progress.ts](../src/routes/progress.ts#L157-L175) and
[src/routes/sessions.ts](../src/routes/sessions.ts#L142-L155)
- **Impact:** Progress uses `ON CONFLICT (id)` without verifying the existing
device belongs to the authenticated user. A caller who knows another device ID
can overwrite its metadata and associate progress or sessions with it.
- **Remediation:** Check `devices.user_id` before update or insert. Enforce
ownership at the database level with a composite foreign-key relationship where
appropriate.

### 5. High: API keys are transmitted in URLs

- **Location:** [src/middleware/auth.ts](../src/middleware/auth.ts#L55-L72),
[frontend/src/api/client.ts](../frontend/src/api/client.ts#L48-L50), and
[src/websocket/auth.ts](../src/websocket/auth.ts#L14-L27)
- **Impact:** Query-string credentials can leak through access logs, browser
history, proxy logs, monitoring systems, and referrer data.
- **Remediation:** Accept API keys through `Authorization: Bearer` headers and
Socket.IO auth payloads only. Reject query-string and body credentials after
clients have migrated, then rotate previously exposed keys.

### 6. Medium: API-wide rate limiting is disabled

- **Location:** [src/app.ts](../src/app.ts#L131-L134)
- **Impact:** API-key validation, progress writes, cover processing, backups,
and metadata routes are not protected by a shared limiter. An attacker can
brute-force credentials or consume database, CPU, storage, and network
resources.
- **Remediation:** Enable distributed rate limiting for authentication and
expensive API operations, keyed by IP and authenticated identity.

### 7. Medium: image processing lacks decoded pixel limits

- **Location:** [src/routes/covers.ts](../src/routes/covers.ts#L143-L147)
- **Impact:** Uploaded JPEGs are passed to Sharp with byte-size and magic-byte
checks but no width, height, or decoded-pixel limit. A highly compressed image
with huge dimensions could cause CPU or memory exhaustion.
- **Remediation:** Inspect metadata before resizing, enforce maximum dimensions
and pixel count, and configure bounded image-processing resource usage.

### 8. Medium: malformed numeric and date input can become `NaN` or HTTP 500

- **Locations:** [src/middleware/validation.ts](../src/middleware/validation.ts#L35-L50),
[src/routes/stats.ts](../src/routes/stats.ts#L150-L166), and
[src/routes/progress.ts](../src/routes/progress.ts#L88-L96)
- **Impact:** Values such as `limit=abc`, invalid date strings, or malformed
chapter numbers are not consistently rejected at the boundary. They can reach
SQL as `NaN` or cause `toISOString()` to throw, producing server errors rather
than a clear 400 response.
- **Remediation:** Validate finite numbers, integer ranges, and dates explicitly
with shared validators. Add regression tests for malformed query and body
values.

### 9. Medium: runtime dependency audit reports a `qs` vulnerability

- **Location:** `package-lock.json` runtime dependency tree
- **Impact:** `npm audit --omit=dev --audit-level=moderate` reports one moderate
`qs` vulnerability involving parsing and denial-of-service behavior.
- **Remediation:** Update the lockfile to a patched version and configure
explicit URL parser depth and parameter limits.

## Verification

- Backend and userscript regression suite: 278 tests passed across 39 files via
`npm test`.
- Frontend suite: 81 tests passed across 12 files.
- Backend TypeScript typecheck passed.
- Biome check passed.
- Frontend lint completed with four warnings and no errors.
- Userscript production build passed.
- `npm run test --prefix userscript` is not available because the userscript
package has no `test` script.

The highest-priority actions are rotating the exposed API key, restoring
PostgreSQL certificate verification, and enforcing authorization boundaries.
