# Scale rehearsal runbook

How to run the site as several containers behind a load balancer, check that
nothing depends on one container, and load-test it. The design is in
[ADR 0013](../adr/0013-containers-shared-cache-and-scale-rehearsal.md); the
results are in the checklist (Week 11).

The rehearsal never touches development data. It runs on:

- its own database, restored from a backup (`countrytopics_rehearsal`, or
  `SCALE_DATABASE_URL`);
- its own uploads bucket;
- its own Valkey prefix (`countrytopics-scale`) for queues, limits, and the
  page cache.

## 1. Restore a backup into the rehearsal's database

```sh
make infra-up
make backup
make backup-list
make restore BACKUP=<newest id> DATABASE=countrytopics_rehearsal FILES_BUCKET=countrytopics-rehearsal
```

To run the rehearsal again from scratch, drop the database first:

```sh
docker compose --env-file .env -f deploy/compose/compose.yaml exec postgres \
  dropdb -U countrytopics countrytopics_rehearsal
```

## 2. Start two web and two worker containers

```sh
make scale-up
```

This builds the images (`apps/web/Dockerfile`, `apps/worker/Dockerfile`) and
starts:

- two `web` containers;
- two `worker` containers;
- the `lb` load balancer (Caddy) at http://localhost:8080.

Each response's `X-Served-By` header names the web container that answered.
Google sign-in is off there, because its registered redirect is the
development address; email links work, through Mailpit
(http://localhost:8025).

If the code is newer than the backup, migrate the rehearsal's database:

```sh
docker compose --env-file .env -f deploy/compose/compose.yaml --profile scale \
  run --rm web node node_modules/payload/bin.js migrate
```

## 3. Check that no state lives in a container

```sh
make scale-check
```

It prepares the rehearsal's database from inside a web container, and refuses
any database not ending in `_rehearsal`. The preparation:

- invites two made-up addresses;
- resets the admin's authenticator, as `make reset-2fa` does;
- clears the sign-in rate limits, so runs can follow each other.

Then, through the load balancer, it checks that:

- a session made on one container works on the other;
- publishing a change to a TEST topic through one container purges the page
  on both;
- the page is then rendered once, and the other container's first answer is
  a HIT from the shared cache;
- a member's comment limit counts across containers.

## 4. Load-test

Fill the rehearsal with made-up content first. It is TEST content only, and
the script refuses any database whose name does not end in `_rehearsal`.

```sh
make scale-seed TOPICS=1000
```

Then run the tests:

```sh
make load-test TEST=cached                     # pages, 100 visitors, 1 s apart
make load-test TEST=uncached                   # search, browse, comments, 50 visitors
make load-test TEST=uncached VUS=50 PAUSE_S=0  # back to back, to find the ceiling
```

The thresholds:

- cached pages: 95th percentile under 300 ms;
- uncached requests: 95th percentile under 800 ms;
- failures under 1% for both.

k6 prints each page's and request's times. To see failover, stop a web
container during a test (`docker stop countrytopics-web-1`) and start it
again.

## 5. Stop

```sh
make scale-down
```

This stops and removes the rehearsal's containers. The database, bucket,
and Valkey keys stay for the next run.
