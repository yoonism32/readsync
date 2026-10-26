# Changelog

Notable changes to ReadSync. The format loosely follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/). There are no
tagged releases. `main` is deployed continuously, so entries are grouped by
date. Detailed write-ups for earlier periods are in
[docs/changelog/](./docs/changelog/).

## 2026-10 (since the 2026-09-12 write-up)

### Added
- NovelPing support:
  - The server accepts NovelPing URLs, hosts and covers.
  - The userscript runs on both sites (5.9.0, then renamed and bumped to
    5.9.1).
  - Migration 020 points `novels.primary_url` at NovelPing.
- Authenticated personal status report at `GET /api/v1/status`.
- Dashboard: a "Needs you" card, a compact nav with a More menu and search,
  and a heatmap loading skeleton.
- Monthly Reading Replay (Phase 2).
- Explorer views that keep their state in the URL; list view shows status
  and progress.
- Replay integration test against a disposable PostgreSQL.
- Full-database backup guide ([docs/BACKUPS.md](./docs/BACKUPS.md)).
- Root `SECURITY.md`, `CONTRIBUTING.md`, `LICENSE`, `docs/USERSCRIPT.md`,
  `docs/TROUBLESHOOTING.md`.

### Changed
- `generate-password-hash.js` no longer accepts the password as an argument.
  It prompts with echo off or reads stdin, so the password never reaches
  shell history. It also rejects passwords over bcrypt's 72-byte limit.
- Docker production builds take `API_KEY` and `USERSCRIPT_UPDATE_TOKEN` as
  BuildKit secrets. Previously a container build had no way to receive them.
- Render's Node runtime is pinned to a patched 22 release (22.23.4).
- Docs refreshed against the current source (2026-10-26).

### Fixed
- 2026-10-26 Dependabot sweep across all three lockfiles:
  - **Runtime:** proxy-addr 2.0.8 (critical), body-parser 2.4.0, compression
    1.8.2 and sharp 0.35.5 (high), ip-address 10.7.4, fast-copy 4.1.0; express
    5.3.0 comes along with them.
  - **Build/dev:** vite 8.3.5, vitest 4.1.12, source-map-js 1.2.2,
    undici 8.12.2, zod 4.6.7.
  - ip-address and fast-copy are pinned in `overrides`. Releases one day
    newer existed, and the older patched versions avoid an untested release.
    Drop the pins once those newer versions have aged.
- npm audit vulnerabilities in lockfiles, including vitest 4.1.11 for a
  path-traversal advisory.
- Server URL helpers handle `chapter-auto-N` URLs.
- Stored NovelArrow source links display as NovelPing URLs.
- Device breakdown `GROUP BY` alias collision; Busiest Day window.
- Progress sync and recovery state hardening; internal backups stay compact
  and restore-compatible.

### Removed
- The temporary 15-second memory/pool/socket diagnostic log from the
  2026-09-12 OOM investigation.
- The retired legacy explorer and unused template assets.
- The dead `schema.ts` bootstrap and the demo API key.

## Earlier

- [2026-09-12: local audit and product polish](./docs/changelog/CHANGELOG-2026-09-12.md)
- [2026-08: proposal gateway](./docs/changelog/2026-08-proposal-gateway.md)
- [2026-08: level-up](./docs/changelog/2026-08-level-up.md)
- [2025-12](./docs/changelog/2025-12.md)
