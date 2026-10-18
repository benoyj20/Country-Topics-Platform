# 0013: Containers, a shared page cache, and the scale rehearsal

- Date: 2026-10-18
- Status: Accepted

## Context

The MVP plan's week 11 scale rehearsal asks for four steps:

1. two web and two worker containers behind a local load balancer, to prove
   the app is stateless;
2. load tests with k6, cached and uncached, fixing slow queries;
3. a backup restored into a fresh database;
4. a test copy on free cloud tiers, changed by environment variables only.

Until now the site and worker ran only as Node processes on the PC; only
backups (ADR 0012) had a container image.

[ADR 0007](0007-public-pages-and-caching.md) left one blocker. Next.js's page
cache lived in each web process's memory and disk, so with two containers a
purge would reach only the one that handled the save. The week 7 checklist
required a shared Redis cache handler before running two web containers.

## Decision

- **A shared page cache** (`apps/web/cache-handler.mjs`, Next.js's
  `cacheHandler`, with `cacheMaxMemorySize: 0`):
  - **What it holds:** pages and `unstable_cache` data live in Valkey under
    `<QUEUE_PREFIX>:page-cache:`, serialized with `v8.serialize` (which keeps
    a page's Buffers and Maps) and kept 7 days at most.
  - **Purges:** a purge records each tag's expiry time in Valkey. An entry
    stored before its tag expired is treated as missing, with Next.js's own
    rules for expired and stale tags.
  - **Why the handler checks tags itself:** Next.js checks tags against a
    list held in each process, which a custom handler's purges never update.
  - **Outages:** a slow or unreachable Valkey is a miss, so the page is
    rendered (2-second limit). A purge that fails is reported as an error.
  - **Build:** `next build` writes nothing to it.
  - **Plain JavaScript:** Next.js imports the file itself, outside its
    bundles. It makes a handler for every request, so the connection and
    all state live outside the handler objects.
  - **Clocks:** times come from each process's clock, as in Next.js's own
    cache, so web containers must share a clock (one host, or NTP).
- **Images** (`apps/web/Dockerfile`, `apps/worker/Dockerfile`), built from the
  repository root:
  - **Node 22.23.3 on Alpine 3.24**, running as the unprivileged `node` user,
    with production dependencies only.
  - **The workspace layout is kept,** as in the backup image: Node runs the
    workspace packages' TypeScript, but not from inside `node_modules`.
  - **The build needs no database.** The web build runs with placeholder
    settings. The only page it pre-renders with data, the home page, skips
    the database during the build: with the shared cache, the build's copy
    is never served (the first visit renders it). This was checked: the
    first request was a MISS that stored the page in Valkey, the next a HIT
    from another container.
  - **Why not compile mode:** Next.js's experimental compile-only build was
    rejected because it turns every page dynamic (`private, no-store`),
    which would defeat a CDN.
- **The rehearsal is a Compose profile, `scale`:**
  - **What runs:** two `web` and two `worker` containers, and Caddy
    (`caddy:2.11.7-alpine`) as the load balancer at http://localhost:8080.
  - **Load balancing:** round robin with active health checks. A request
    that cannot reach a container is retried on another for up to 5 seconds,
    and a failing container is skipped for 10. Caddy names the answering
    container in `X-Served-By`.
  - **Its own data:** the profile runs on a database restored from a backup
    (`countrytopics_rehearsal`), its own bucket, and its own Valkey prefix
    (`countrytopics-scale`). Development data is never touched.
  - **Configuration:** containers take `.env` and override only the addresses
    of services as containers see them (`CONTAINER_DATABASE_URL`,
    `CONTAINER_S3_ENDPOINT`, as in ADR 0012). `CLIENT_IP_HEADER` is
    `x-forwarded-for`, which Caddy sets for every request.
- **Tools kept in the repository,** so step 4 can repeat them against a cloud
  copy:
  - `make scale-check` (`deploy/rehearsal/check-stateless.mjs`) proves the
    containers hold no state. It covers sessions, the shared page cache,
    purges, and rate limits, alternating between containers.
  - `make scale-seed` fills the rehearsal database with TEST content. It
    refuses any database whose name does not end in `_rehearsal`.
  - `make load-test` runs k6 (`grafana/k6:1.8.2`), cached and uncached, with
    times per page and per request, from inside the Compose network.

## Consequences

- AGENTS.md's "shared page cache in Redis" now holds. Development and the
  pilot use the shared cache too, so they behave like production.
- The web image is about 2 GB (the worker's about 400 MB), mostly the
  production dependency tree (Next.js's compilers, Payload's admin,
  Sentry's build tools). Slimming it
  (for example Next.js's standalone output) is left for the cloud step,
  where pull times matter.
- The build logs one Better Auth warning ("could not validate the database
  schema"): it has no database to check. The site checks again when it
  starts.
- Google sign-in is off in the rehearsal, because its registered redirect is
  the development address. The cloud copy needs its own redirect URL.
- Step 4 (a test copy on free cloud tiers) is not done here. It needs the
  developer's cloud accounts, and the images and checks above are what it
  will reuse.
