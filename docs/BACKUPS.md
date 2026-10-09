# Full database backups to your computer

ReadSync's automatic daily backups save your library and current reading positions. Use this
separate Docker workflow for the full database, including every progress snapshot, reading session
and notification.

Run these commands on **your own computer**, with Docker running. No ReadSync server or Render
process is involved. Supabase still does the database reads and sends the data, so expect temporary
database load and outbound traffic. The dump does not modify source records, although its read locks
can conflict with schema changes. Prefer a quiet time outside deployments.

## 1. Check the connection and PostgreSQL version

In Supabase, open **Connect → Session pooler** and check the host, username and database. Use port
**5432** for this workflow, not the application's transaction pooler on port 6543. The session
pooler keeps a stable connection for the duration of the dump; the transaction pooler will drop
`pg_dump` mid-stream.

Put the URL in your local `.env` file (never commit it):

```dotenv
DUMP_URL="postgresql://postgres.<project-ref>:<password>@<region>.pooler.supabase.com:5432/postgres"
```

Use the **database password**, not the Supabase API/service key. Keeping it in `.env` avoids putting
it in shell history or in the repo.

The examples use `postgres:17`. Check the server version in the Supabase SQL editor with `SHOW
server_version;`. If the server uses another major version, prefer that matching Docker tag
throughout this guide. `pg_dump` must not be older than the server's major version.

## 2. Download a backup

Paste this into Bash on Linux or macOS. It reads `DUMP_URL` from `.env`, creates a timestamped file,
and verifies the archive before promoting it from `.partial` to its final name.

```bash
(
  set -e
  umask 077

  ENV_FILE="${ENV_FILE:-./.env}"
  [ -r "$ENV_FILE" ] || { echo "Cannot read $ENV_FILE" >&2; exit 1; }
  set -a; . "$ENV_FILE"; set +a
  : "${DUMP_URL:?DUMP_URL is not set in $ENV_FILE}"

  BACKUP_DIR="${BACKUP_DIR:-$HOME/readsync-backups}"
  mkdir -p "$BACKUP_DIR" || { echo "Cannot create $BACKUP_DIR" >&2; exit 1; }

  STAMP="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
  NAME="readsync-full-$STAMP.dump"

  if docker run --rm -it \
      -e PGSSLMODE=require \
      -e PGURL="$DUMP_URL" \
      -e OUT="$NAME" \
      -v "$BACKUP_DIR:/backups" \
      postgres:17 \
      bash -c 'umask 077; pg_dump "$PGURL" \
                 --format=custom --no-owner --no-acl \
                 --file="/backups/$OUT.partial"'
  then
    docker run --rm \
        -v "$BACKUP_DIR:/backups:ro" \
        postgres:17 \
        pg_restore --list "/backups/$NAME.partial" >/dev/null

    mv "$BACKUP_DIR/$NAME.partial" "$BACKUP_DIR/$NAME"
    echo "Backup saved: $BACKUP_DIR/$NAME"
    ls -lh "$BACKUP_DIR/$NAME"
  else
    echo "Backup FAILED. Any .partial file is NOT a completed backup." >&2
    exit 1
  fi
)
```

The Docker mount maps `/backups` to **`$HOME/readsync-backups` on your disk** (override with
`BACKUP_DIR=...`). `--rm` removes the temporary container, not the saved file. Custom-format dumps
are compressed. The second command reads the archive and generates SQL into `/dev/null`; it does not
connect to a database. The `.partial` suffix is removed only if both commands succeed. Review any
warnings as well as the exit status.

### Why `.partial`

A file named `*.dump` is a complete, verified backup. A file named `*.dump.partial` did not finish
or did not verify — do not trust it. The rename happens only after `pg_dump` exits successfully
**and** `pg_restore --list` can read the archive. This protects you from network drops, Ctrl-C,
disk-full, and silent `pg_dump` errors — cases where a truncated file would otherwise look identical
to a good one.

Weekly is a reasonable starting schedule if up to a week of full-history loss is acceptable. Also
take one before major migrations or key rotations. Keep several dated copies and an encrypted copy
on another disk or backup service.

### File permissions

The container writes with its own default umask, so dumps may land as world-readable. The example
above adds `umask 077` inside the container so the file is created as `-rw-------`. If you ran an
earlier version without it, tighten the file afterward:

```bash
chmod 600 /path/to/readsync-full-*.dump
```

Dumps contain private data, including database-stored authentication information. Don't commit them.

## 3. Inspect a saved file

Replace the filename below with the actual saved name:

```bash
docker run --rm \
  -v "$HOME/readsync-backups:/backups:ro" postgres:17 \
  pg_restore --list /backups/readsync-full-2026-09-14T12-00-00Z.dump
```

Look for `TABLE DATA public progress_snapshots` and the other ReadSync tables. Listing contents
checks the archive's table of contents; it does not prove that all data can be restored. The
download command above also reads the archive payload, but only a successful restore to an isolated
database verifies recovery.

To inspect a single table without a restore:

```bash
docker run --rm \
  -v "$HOME/readsync-backups:/backups:ro" postgres:17 \
  pg_restore --data-only --table=public.progress_snapshots \
    --file=/dev/stdout /backups/readsync-full-2026-09-14T12-00-00Z.dump \
  | head -50
```

## What this file covers

This is a logical dump of the `postgres` database, without a table/history filter. It includes the
accessible database schemas and their data, rather than just the compact ReadSync backup. If
permissions prevent a complete dump, treat the run as failed; don't hide the error by enabling
row-security filtering.

It is **not a complete Supabase project image**:

- Storage metadata may be present, but actual Storage files (cover images and stored JSON backups)
are not. Copy those separately if you need them.
- Cluster-wide roles, their passwords and tablespaces aren't included by `pg_dump`. This workflow
also omits grants (`--no-acl`).
- Render environment variables, Supabase project settings, Edge Function code and application source
aren't contained in the dump.

Because `--no-owner` and `--no-acl` are used, the custom-format archive drops ownership and
permission statements, so the dump is portable across roles.Because the dump is taken as a
privileged connection, it will typically include Supabase-managed schemas such as `auth` and
`storage` — password hashes, refresh tokens, session tokens and OAuth client secrets. Treat the file
accordingly.

## Restoring: a separate operation

A `.dump` file uses `pg_restore`; it cannot be uploaded through ReadSync's JSON **Import Data**
button. Backup and inspection read the source/file; restoring writes into the destination database.

**Do not point `pg_restore --clean` at production as a verification step.** `--clean` drops the
objects being restored before recreating them, which can replace newer data. Test on a separate
database first.

A full raw Supabase dump can contain managed schemas, roles referenced by policies, and extensions
that a stock PostgreSQL container or a new managed project doesn't have permission to recreate. The
dump alone therefore isn't a guaranteed one-command restore into either environment. For a
Supabase-to-Supabase recovery, follow the official [backup and restore
guide](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore), which
uses platform-aware exports. For this custom archive, prepare a compatible isolated target and
review/select the archive entries before restoring.

Once that target and archive selection are prepared, the restore command has this shape (replace
every `REPLACE_...` value):

```bash
docker run --rm -it \
  -e PGSSLMODE=require \
  -v "$HOME/readsync-backups:/backups:ro" postgres:17 \
  pg_restore --password --exit-on-error --single-transaction \
    --no-owner --no-acl \
    -h REPLACE_WITH_TEST_HOST -p 5432 \
    -U REPLACE_WITH_TEST_USER -d REPLACE_WITH_EMPTY_TEST_DATABASE \
    /backups/REPLACE_WITH_BACKUP_FILENAME.dump
```

This intentionally does not drop existing objects. Missing dependencies or conflicting objects must
be resolved in the test environment; don't ignore restore errors. Check full snapshot counts,
library contents and reading positions after a successful restore before considering production
recovery. `--no-owner` is specified on restore too because it is ignored by `pg_dump` when producing
a custom-format archive.

## Troubleshooting

**`could not open output file ... Permission denied`** — the host directory being mounted is not
writable by the container's user. Confirm with `ls -ldn <dir>` on the host; if it is owned by root,
either `sudo chown "$(id -u):$(id -g)" <dir>`
(or `sudo chgrp` + `chmod 775`), or pick a directory under `$HOME` that you already own.

**`could not connect` / connection times out** — the host in `DUMP_URL` isn't reachable from inside
the container.
If the URL contains `localhost`, either use the session-pooler hostname, or add `--network host` to
the `docker run` invocation.

**`server version mismatch`** — the Docker tag is older than the server. Bump the tag to match the
server's major version (see §1).

## References

- [PostgreSQL: pg_dump](https://www.postgresql.org/docs/17/app-pgdump.html)
- [PostgreSQL: pg_restore](https://www.postgresql.org/docs/17/app-pgrestore.html)
- [Supabase database connections](https://supabase.com/docs/guides/database/connecting-to-postgres)
- [Supabase backup coverage](https://supabase.com/docs/guides/platform/backups)
