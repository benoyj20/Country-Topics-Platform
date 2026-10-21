# Workers spike (ADR 0014, phases 1 and 2)

A throwaway Next.js app that shows, before any real work is built on it,
that the new frontend can run on Cloudflare Workers through OpenNext:

- the public topic page (phase 1), with pages cached in R2, tags in D1, and
  background revalidation through a Durable Object queue;
- an admin page in the same build (phase 2), editing a topic through
  Payload's REST API on the real local backend.

Nothing here is deployed, and the apps never import it.

## What it has

The site and the admin are two route groups, each with its own root
layout, so neither loads the other's styles or scripts.

- `app/(site)/`: the site.
  - `topics/[slug]/page.tsx`: the topic page, built from page data fetched
    with apps/web's cache tags and cached for an hour. `short/[slug]` is
    the same page with its data cached for five seconds, to watch a
    background refresh bring in new data.
  - `TopicBody.tsx`: apps/web's rich-text renderer, copied.
  - `layout.tsx`, `styles.css`: the site's fonts (`next/font`) and styles,
    copied.
- `app/(admin)/admin/`: the admin.
  - `page.tsx`: the gate, which asks the backend whether the visitor is
    staff with a recent authenticator check, and the latest topics.
  - `topics/[id]/`: the topic editor: the title, the summary, one relation
    (the countries), the body, and the change note, saved as a draft or
    published. A refusal shows beside the field it names.
  - `BodyEditor.tsx`: Lexical, loaded in the browser only.
  - `body-nodes.ts`: the editor's nodes, saving the JSON Payload's editor
    saves.
  - `layout.tsx`, `admin.css`: the admin's own layout and styles.
- `app/api/[...path]/route.ts`: a stand-in for phase 4's pass-through. It
  sends the admin's `/api/*` calls on to the backend with the visitor's
  cookie.
- `app/api/revalidate/route.ts`: the purge the worker will send, checked
  with a shared value (the real one is signed).
- `app/boom/route.ts`: throws, to test error reports.
- `worker.ts`: OpenNext's Worker wrapped with Sentry's Cloudflare SDK and
  the site's scrubbing.
- `backend.mjs`: stand-ins for the backend's page-data endpoint and for
  Sentry. `fixtures/test-topic.json` is a TEST topic.
- `tests/body-json.test.ts`: checks that the editor saves what Payload's
  editor saves (`pnpm test`).
- `check-pages.mjs`: checks that the public pages load none of the admin's
  files, and the admin none of the site's.

## Run it

OpenNext's build makes symbolic links, which Windows allows only in
Developer Mode, so the spike builds and runs in a Linux container. From the
repository root:

```sh
docker build -f prototypes/workers-spike/Dockerfile -t countrytopics-workers-spike .
docker run --rm --add-host=host.docker.internal:host-gateway -p 127.0.0.1:8787:8787 -p 127.0.0.1:3102:3102 countrytopics-workers-spike
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

### The admin

The admin talks to the real local backend, apps/web on
http://localhost:3000, so start it first (`make dev`, or `pnpm start` after
a build).

1. Sign in on the backend as staff: http://localhost:3000/sign-in. Then pass
   the authenticator check at http://localhost:3000/admin. Browsers do not
   tie cookies to a port, so the same sign-in reaches the spike.
2. Open http://localhost:8787/admin and press **New TEST topic**. Edit only
   TEST topics.
3. Pages: `docker exec <container> node check-pages.mjs`. To include the
   editor, add `-e ADMIN_COOKIE="<the Cookie header>" -e ADMIN_TOPIC=<id>`.

The admin's writes are accepted only from `SITE_URL` in `wrangler.jsonc`
(`http://localhost:8787`). Served from another address, such as a tunnel,
the preview needs `--var SITE_URL:<that address>`.

The body test runs on Windows too: `pnpm --filter
@countrytopics/workers-spike test`. `BODIES_FILE`, a JSON array of bodies,
adds them to the bodies checked.

## Results

Phase 1 (2026-10-21) and phase 2 (2026-10-21) passed every check; see ADR
0014, "Phase 1 results" and "Phase 2 results".
