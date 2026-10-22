# Backup and restore runbook

How the site's data is backed up and how to get it back. The design is in
[ADR 0012](../adr/0012-backups-and-error-reporting.md).

## What is backed up

- **The database** (PostgreSQL, the only source of truth): a full dump once a
  day, kept for 14 days. The privacy policy states this period. The newest
  backup is never deleted, even if backups stop.
- **Uploads** (evidence files and photos): every file is copied once into the
  backup bucket, because files never change once uploaded. Each backup lists
  its files. A copy is deleted when no kept backup lists it, so a file
  removed from the site leaves the backups after 14 days.
- **Not backed up:** Valkey, which holds only queues, rate limits, and caches.
  They rebuild themselves, and the search index is rebuilt from the database
  every hour.

The `backup` Compose service does this. It starts with `make infra-up` and
checks every hour whether a backup is due. Each backup is a dump
(`db/<id>.dump`) and a manifest (`db/<id>.json`) in the backup bucket. The
manifest is written last and records:

- every table's row count, from the same snapshot as the dump;
- the newest migration;
- the dump's size and SHA-256 checksum.

## Where backups go

Settings are the `BACKUP_S3_*` variables in `.env`. Empty values other than
the bucket fall back to the site's `S3_*` settings.

- **Locally:** the `countrytopics-backups` bucket in the storage container.
  This is the same disk as the database, so it protects against mistakes
  and damaged data, but not against losing the disk.
- **For the pilot:** set all five `BACKUP_S3_*` variables to another
  S3-compatible service, such as a Cloudflare R2 bucket, so one failure
  cannot lose both the site and its backups. A different endpoint must have
  its own keys. Then run `make backup` and `make backup-list` to check that
  it works.
- **If the site's database or uploads move to managed services:** set
  `CONTAINER_DATABASE_URL` and `CONTAINER_S3_ENDPOINT` to them, so the
  backup container backs up the right ones.

## Everyday checks

```sh
make backup-list        # newest first: time, size, rows, uploads, migration
make backup             # take one now, for example before a risky change
docker compose --env-file .env -f deploy/compose/compose.yaml logs backup
```

The newest backup should be less than a day old. A failed backup is logged,
sent to Sentry when `SENTRY_DSN` is set, and tried again at the next hourly
check. If the newest backup is more than two days old, that is reported too.

## Restore drill (test a backup)

A restore always goes into a **new** database and never touches the live one:

```sh
make restore BACKUP=<id from make backup-list> DATABASE=countrytopics_restore FILES_BUCKET=countrytopics-restore
```

It downloads the dump and checks its checksum. Then it creates the database,
restores into it, and compares every table's row count with the manifest; any
difference stops it with the tables named. Last, it copies the backup's own
uploads into `FILES_BUCKET`.

Backups taken before 2026-10-21, when the split's phase 0 dropped pgvector
(ADR 0014), still list that extension. The database now runs the plain
`postgres:17-bookworm` image, which lacks it, so their restore stops at
`CREATE EXTENSION IF NOT EXISTS vector` and leaves the new database half
made (drop it as below). Restore one of them on a server that has pgvector,
such as a temporary `pgvector/pgvector:pg17` container, or use a newer
backup.

To look at the restored site, start a copy of the API against it, and a
frontend in front of that copy (the API renders no pages; ADR 0014):

```sh
DATABASE_URL=postgres://<user>:<password>@localhost:5433/countrytopics_restore?sslmode=disable \
DATABASE_REPLICA_URL= S3_BUCKET=countrytopics-restore QUEUE_PREFIX=countrytopics-restore \
SITE_URL=http://localhost:3100 \
pnpm --filter @countrytopics/api start --port 3200

SITE_URL=http://localhost:3100 BACKEND_URL=http://localhost:3200 \
pnpm --filter @countrytopics/frontend start --port 3100
```

Then open http://localhost:3100. The user and password are the ones in
`.env`'s `DATABASE_URL`. This needs both apps built first
(`pnpm --filter @countrytopics/api build` and
`pnpm --filter @countrytopics/frontend build`).

Afterwards, remove the copy:

```sh
docker compose --env-file .env -f deploy/compose/compose.yaml exec postgres \
  dropdb -U countrytopics countrytopics_restore
```

## Recovering the live site

1. Stop the site and the worker, so nothing writes to the damaged database.
2. Choose the backup with `make backup-list`. Note its time: anything after
   it is lost.
3. Restore it into a new database, and its uploads into the site's own
   bucket (only missing files are copied):
   `make restore BACKUP=<id> DATABASE=countrytopics_<date> FILES_BUCKET=<S3_BUCKET>`.
4. Point `DATABASE_URL` (and `DATABASE_REPLICA_URL`) at the new database.
   Keep the old one until the site is checked.
5. **Delete again the accounts deleted since the backup.** The backup still
   holds their data, and the privacy policy promises that deletion lasts.
   - If the old database can still be read, list them:

     ```sql
     SELECT created_at, details->>'email' AS email FROM audit_log
      WHERE action = 'user.deleted' AND created_at > '<backup time>';
     ```

   - Delete each of them again in the admin panel (Users).
6. Start the site and the worker. The search index rebuilds within the hour.
   Check a few topics and sign in.
7. Run `make migrate` if the code is newer than the backup's newest
   migration (shown by `make backup-list`).

## Changing this

- **Changing the retention period** (`BACKUP_RETENTION_DAYS` in
  `apps/backup/src/catalog.ts`) means changing the privacy policy in the same
  PR.
- **Upgrading PostgreSQL** to a new major version means changing
  `postgresql17-client` in `apps/backup/Dockerfile` and the CI step that
  installs the client to match.
