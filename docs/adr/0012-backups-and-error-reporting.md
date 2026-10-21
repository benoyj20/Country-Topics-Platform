# 0012: Backups and error reporting

- Date: 2026-10-18
- Status: Accepted; the suggestion of R2 for backups is superseded by
  [ADR 0014](0014-split-site-and-backend.md)

## Context

MVP week 11 asks for backups, a tested restore ("restore a backup into a
fresh database"), and Sentry before testers arrive. The pilot runs on the
developer's PC (ADR 0001):

- PostgreSQL runs in Compose, and the PC has no PostgreSQL tools of its own.
- Uploads live in S3-compatible storage.
- Testers' data, including deletions (ADR 0011), must survive a failure, and
  a restore must not bring deleted accounts back unnoticed.

Error reports must help fix faults without becoming a second copy of
people's data. The privacy policy names every service that receives data.

The scale rehearsal (containers for the site and worker, a load balancer,
load tests) is the rest of week 11, in its own PR.

## Decision

- **A backup container**, `apps/backup`:
  - Node with the PostgreSQL 17 client tools, run by Compose as the `backup`
    service.
  - It needs nothing installed on the host and works the same against a
    managed database: only its environment variables change.
- **What a backup is:**
  - `pg_dump` in custom format, taken from an exported snapshot.
  - The same snapshot gives every table's row count, so a restore is checked
    exactly.
  - A manifest records the counts, the newest migration, and the dump's size
    and SHA-256, and is written last.
  - Uploads are copied once into `files/`, since they never change after
    upload. Each manifest lists the uploads its backup holds.
  - A copy is deleted once no kept backup lists it. So a file removed from
    the site, for example for a legal reason, leaves the backups after 14
    days like the rest, and a restore copies only the files its own backup
    lists.
  - Valkey is not backed up: it holds only queues, limits, and caches.
- **When and for how long:**
  - The service checks hourly and takes a backup when the newest is a day
    old.
  - Backups are kept 14 days. The newest is never deleted.
  - The period is a constant beside the privacy policy's wording, not
    configuration, so the two cannot drift apart.
- **Where:**
  - The `BACKUP_S3_*` settings, each defaulting to the site's storage, with a
    bucket that must differ from the site's. A different endpoint needs its
    own keys, so the site's keys are never sent to another service.
  - Containers reach the database and uploads through `CONTAINER_DATABASE_URL`
    and `CONTAINER_S3_ENDPOINT`, which default to the Compose services and
    are set when the site uses managed ones.
  - Locally that is the same disk. For the pilot it should be another
    service, such as Cloudflare R2. The checklist tracks this.
- **Restores go only into a new database**, created by the tool. It refuses
  the live database and any that exists. It checks the dump's checksum, then
  compares every table's row count with the manifest. It can copy uploads
  into a bucket, copying only missing files.
- **Failures are reported.** A failed backup or restore, a manifest that
  cannot be read (skipped, so it cannot stop backups), and a newest backup
  more than two days old are logged as errors and sent to Sentry.
- **The image keeps the workspace layout.** Node runs TypeScript directly,
  but not from inside `node_modules`, and pnpm links workspace packages to
  their own folders. A test runs the real command, so a module that cannot
  load fails in CI. The worker's image (scale rehearsal) will work the same
  way.
- **Recovering the live site** follows
  [the runbook](../runbooks/backup-and-restore.md). It includes deleting
  again the accounts deleted after the backup.
- **Error reporting with Sentry**, off without `SENTRY_DSN`:
  - **What is reported:**
    - On the site's server: errors Next.js catches (`onRequestError`),
      Payload API errors of 500 or above, and `console.error` calls. Those
      are how the `/api/v1` routes record failures they answer with 503.
    - In the worker: a job's last failed attempt, including one that fails
      for good at once (an `UnrecoverableError`), and its own errors.
      Attempts that will be retried are only warnings.
    - In the browser: the SDK loads after the page.
  - **Less personal data:** the `@countrytopics/observability` package
    scrubs every event and breadcrumb. It removes:
    - the user, cookies, request bodies, and query strings;
    - every header but the user agent;
    - email addresses in messages and in extra data, such as the console's
      arguments;
    - console and click breadcrumbs.
  - **No tracing:** no performance tracing, replays, or session counts.
  - **The browser never talks to Sentry.** It sends to `/api/v1/errors`.
    The site:
    - accepts only requests from its own pages;
    - rate-limits them per visitor address when a trusted proxy header
      gives one (`CLIENT_IP_HEADER`), else in one shared bucket, since
      other headers can be forged, and caps them for the whole site to
      protect the Sentry project's quota;
    - keeps only error events and scrubs them again;
    - sets the environment and adds the real DSN;
    - forwards them with a timeout.

    So Sentry sees the site's address, not visitors'. Cached pages need no
    configuration, and the DSN stays on the server.
- **The project's region is the US**, chosen by the developer. The privacy
  policy says so.
- **SDKs:**
  - `@sentry/nextjs` and `@sentry/node`, pinned to 11.4.0, the newest
    release at least two weeks old when added.
  - No build plugin: source maps are not uploaded, so browser stack traces
    stay minified. That needs a Sentry auth token at build time, which can
    come later.

## Consequences

- `make check` runs the backup tests in the backup image (`make
  test-backup`). CI runs them on the runner with the PostgreSQL 17 client
  installed, and builds the image.
- A backup on the same disk does not survive losing the disk. Before the
  pilot, the developer sets `BACKUP_S3_*` to another service.
- Restoring brings back accounts deleted after the backup until they are
  deleted again. The runbook does this from the audit log. Restores are rare,
  so it is a manual step.
- Development errors reach Sentry too, labelled with the `development`
  environment. The pilot sets `SENTRY_ENVIRONMENT=pilot`.
- Admin panel pages do not load the browser reporter. Their server errors
  are reported.
- Upgrading PostgreSQL's major version means changing the client package in
  the backup image and in CI.
