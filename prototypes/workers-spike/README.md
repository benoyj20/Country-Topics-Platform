# Workers spike (ADR 0014, phase 1)

A throwaway Next.js app that renders one topic page the way the new
frontend will: on Cloudflare Workers through OpenNext, with pages cached in
R2, tags in D1, and background revalidation through a Durable Object queue.
It checks, before any real work is built on it, that the frontend can run
there. Nothing here is deployed, and the apps never import it.

## What it has

- `app/topics/[slug]/page.tsx`: the topic page, from page data fetched with
  apps/web's cache tags and cached for an hour; `app/short/[slug]` is the
  same page with its data cached for five seconds, to watch a background
  refresh bring in new data.
- `app/TopicBody.tsx`: apps/web's rich-text renderer, copied.
- `app/layout.tsx`, `app/styles.css`: the site's fonts (`next/font`) and
  styles, copied.
- `app/api/revalidate/route.ts`: the purge the worker will send, checked
  with a shared value (the real one is signed).
- `app/boom/route.ts`: throws, to test error reports.
- `worker.ts`: OpenNext's Worker wrapped with Sentry's Cloudflare SDK and
  the site's scrubbing.
- `backend.mjs`: stand-ins for the backend's page-data endpoint and for
  Sentry; `fixtures/test-topic.json` is a TEST topic.

## Run it

OpenNext's build makes symbolic links, which Windows allows only in
Developer Mode, so the spike builds and runs in a Linux container. From the
repository root:

```sh
docker build -f prototypes/workers-spike/Dockerfile -t countrytopics-workers-spike .
docker run --rm -p 127.0.0.1:8787:8787 -p 127.0.0.1:3102:3102 countrytopics-workers-spike
```

Then open http://localhost:8787/topics/test-workers-spike-topic. More
topics can be added by mounting their page data into `fixtures/`.

- Purge: change the title with
  `curl -X POST "http://localhost:3102/test/title?slug=test-workers-spike-topic&title=Edited"`,
  then
  `curl -X POST -H "x-purge-key: spike-local-purge-key" "http://localhost:8787/api/revalidate?tag=public:topics"`,
  the tag apps/web purges when a topic is published.
- Error report: open http://localhost:8787/boom, then
  http://localhost:3102/test/reports.
- Size: `docker run --rm countrytopics-workers-spike pnpm size`.
- Start-up: `docker run --rm countrytopics-workers-spike npx wrangler check startup`.

## Results (2026-10-21)

All of phase 1's checks passed; see ADR 0014, "Phase 1 results".
