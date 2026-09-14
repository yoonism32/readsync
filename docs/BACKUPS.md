# Full database backups to your computer

ReadSync's automatic daily backups save your library and current reading
positions. Use this separate Docker workflow for the full database, including
every progress snapshot, reading session and notification.

Run these commands on **your own computer**, with Docker running. No ReadSync
server or Render process is involved. Supabase still does the database reads
and sends the data, so expect temporary database load and outbound traffic.
The dump does not modify source records, although its read locks can conflict
with schema changes. Prefer a quiet time outside deployments.

## 1. Check the connection and PostgreSQL version

In Supabase, open **Connect → Session pooler** and check the host, username and
database. Use port **5432** for this workflow, not the application's transaction
pooler on port 6543. The examples below use this project's previously configured
session-pooler details; update them if the dashboard shows different values.

Use the **database password**, not the Supabase API/service key. The command
prompts for it, so you don't need to put it in shell history or in this repo.

The examples use `postgres:17`. Check the server version in the Supabase SQL
editor with `SHOW server_version;`. If the server uses another major version,
prefer that matching Docker tag throughout this guide. `pg_dump` must not be
older than the server's major version.

## 2. Download a backup

Paste this into Bash on Linux or macOS. It creates a timestamped file so normal
weekly runs retain previous backups. Your password is requested by `pg_dump`.

```bash
(
  umask 077
  mkdir -p "$HOME/readsync-backups" || exit 1
  backup_name="readsync-$(date -u +%Y-%m-%dT%H-%M-%SZ).dump"

  if docker run --rm -it \
    --user "$(id -u):$(id -g)" \
    -e PGSSLMODE=require \
    -v "$HOME/readsync-backups:/backups" \
    postgres:17 \
    pg_dump --password --format=custom --no-owner --no-acl \
      --file="/backups/$backup_name.partial" \
      -h aws-0-eu-west-2.pooler.supabase.com \
      -p 5432 -U postgres.hzziccyyziljuqxuzxrl -d postgres \
    && docker run --rm \
      -v "$HOME/readsync-backups:/backups:ro" postgres:17 \
      pg_restore --file=/dev/null "/backups/$backup_name.partial"
  then
    mv "$HOME/readsync-backups/$backup_name.partial" \
       "$HOME/readsync-backups/$backup_name" || exit 1
    printf 'Backup saved: %s\n' "$HOME/readsync-backups/$backup_name"
  else
    printf 'Backup failed. Any .partial file is not a completed backup.\n' >&2
    exit 1
  fi
)
```

The Docker mount maps `/backups` to **`~/readsync-backups` on your disk**.
`--rm` removes the temporary container, not the saved file. Custom-format dumps
are compressed. The second command reads the archive and generates SQL into
`/dev/null`; it does not connect to a database. The `.partial` suffix is removed
only if both commands succeed. Review any warnings as well as the exit status.

Weekly is a reasonable starting schedule if up to a week of full-history loss
is acceptable. Also take one before major migrations. Keep several dated copies
and an encrypted copy on another disk or backup service. Dumps contain private
data, including database-stored authentication information; don't commit them.

## 3. Inspect a saved file

Replace the filename below with the actual saved name:

```bash
docker run --rm \
  -v "$HOME/readsync-backups:/backups:ro" postgres:17 \
  pg_restore --list /backups/readsync-2026-09-14T12-00-00Z.dump
```

Look for `TABLE DATA public progress_snapshots` and the other ReadSync tables.
Listing contents checks the archive's table of contents; it does not prove that
all data can be restored. The download command above also reads the archive
payload, but only a successful restore to an isolated database verifies recovery.

## What this file covers

This is a logical dump of the `postgres` database, without a table/history
filter. It includes the accessible database schemas and their data, rather than
just the compact ReadSync backup. If permissions prevent a complete dump, treat
the run as failed; don't hide the error by enabling row-security filtering.

It is **not a complete Supabase project image**:

- Storage metadata may be present, but actual Storage files (cover images and
  stored JSON backups) are not. Copy those separately if you need them.
- Cluster-wide roles, their passwords and tablespaces aren't included by
  `pg_dump`. This workflow also omits grants (`--no-acl`).
- Render environment variables, Supabase project settings, Edge Function code
  and application source aren't contained in the dump.

## Restoring: a separate operation

A `.dump` file uses `pg_restore`; it cannot be uploaded through ReadSync's JSON
**Import Data** button. Backup and inspection read the source/file; restoring
writes into the destination database.

**Do not point `pg_restore --clean` at production as a verification step.**
`--clean` drops the objects being restored before recreating them, which can
replace newer data. Test on a separate database first.

A full raw Supabase dump can contain managed schemas, roles referenced by
policies, and extensions that a stock PostgreSQL container or a new managed
project doesn't have permission to recreate. The dump alone therefore isn't a
guaranteed one-command restore into either environment. For a Supabase-to-Supabase
recovery, follow the official [backup and restore guide](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore),
which uses platform-aware exports. For this custom archive, prepare a compatible
isolated target and review/select the archive entries before restoring.

Once that target and archive selection are prepared, the restore command has
this shape (replace every `REPLACE_...` value):

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

This intentionally does not drop existing objects. Missing dependencies or
conflicting objects must be resolved in the test environment; don't ignore
restore errors. Check full snapshot counts, library contents and reading
positions after a successful restore before considering production recovery.
`--no-owner` is specified on restore too because it is ignored by `pg_dump`
when producing a custom-format archive.

## References

- [PostgreSQL: pg_dump](https://www.postgresql.org/docs/17/app-pgdump.html)
- [PostgreSQL: pg_restore](https://www.postgresql.org/docs/17/app-pgrestore.html)
- [Supabase database connections](https://supabase.com/docs/guides/database/connecting-to-postgres)
- [Supabase backup coverage](https://supabase.com/docs/guides/platform/backups)
