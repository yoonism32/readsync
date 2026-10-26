# ReadSync docs

Start with [ARCHITECTURE.md](./ARCHITECTURE.md). It covers the current stack,
data flow, auth model, security headers and rate limiting. The current-state
docs below were last checked against the source on 2026-10-26.

## Current state

- [ARCHITECTURE.md](./ARCHITECTURE.md): how the system works today
- [API_REFERENCE.md](./API_REFERENCE.md): every route with its auth and validation, plus the WebSocket events
- [DATABASE.md](./DATABASE.md): schema, the reason behind each migration, and how to add one
- [DEPLOYMENT.md](./DEPLOYMENT.md): env vars, Render/Docker, local dev
- [USERSCRIPT.md](./USERSCRIPT.md): installing, updating and building the userscript
- [TESTING.md](./TESTING.md): what's covered, what isn't, how to run it
- [BACKUPS.md](./BACKUPS.md): in-app scheduled backups, and full database downloads to your disk with Docker
- [TROUBLESHOOTING.md](./TROUBLESHOOTING.md): common startup, login, userscript and live-update problems
- [ROADMAP.md](./ROADMAP.md): open and accepted-but-unbuilt work
- [NOVELPING_MIGRATION.md](./NOVELPING_MIGRATION.md): the NovelArrow → NovelPing move

Repository-level: [SECURITY.md](../SECURITY.md) (reporting policy),
[CONTRIBUTING.md](../CONTRIBUTING.md), [CHANGELOG.md](../CHANGELOG.md),
[DESIGN.md](../DESIGN.md) (dashboard design system).

## Historical records

These are dated snapshots. They are kept for context and are not updated.
Where they disagree with the docs above, the docs above win.

- Security: [SECURITY-AUDIT-2026-09-09.md](./SECURITY-AUDIT-2026-09-09.md),
  [SECURITY-REMEDIATION-2026-09-11.md](./SECURITY-REMEDIATION-2026-09-11.md)
- Design audits: [IMPECCABLE-AUDIT-2026-09-05.md](./IMPECCABLE-AUDIT-2026-09-05.md),
  [IMPECCABLE-PAGES-AUDIT-2026-09-11.md](./IMPECCABLE-PAGES-AUDIT-2026-09-11.md)
- Roadmap execution log: [ROADMAP-EXECUTION.md](./ROADMAP-EXECUTION.md)
- Changelogs:
  - [changelog/CHANGELOG-2026-09-12.md](./changelog/CHANGELOG-2026-09-12.md)
  - [changelog/2026-08-proposal-gateway.md](./changelog/2026-08-proposal-gateway.md)
  - [changelog/2026-08-level-up.md](./changelog/2026-08-level-up.md): the full source the 2026-08 docs reorganization was trimmed from
  - [changelog/2025-12.md](./changelog/2025-12.md)
- Ideas:
  - [ideas/future-specs.md](./ideas/future-specs.md): full specs for the open Tier 4 backlog items
  - [ideas/2026-09-15-roadmap-research.md](./ideas/2026-09-15-roadmap-research.md)

The chapter-update bot was removed outright on 2026-09-08; see
[ARCHITECTURE.md](./ARCHITECTURE.md#the-bot-was-removed).
