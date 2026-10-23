# The frontend built for Cloudflare Workers and run in workerd, the Workers
# runtime, on Linux: on Windows, OpenNext's build needs symbolic links that
# only Developer Mode allows (ADR 0014, phase 1). For local checks only.
# Built from the repository root:
#   docker build -f apps/frontend/Dockerfile -t countrytopics-frontend-worker .
# Run with the repository's .env, for the forwarding key the backend uses,
# the purge key the worker uses, and the legal pages' SITE_OPERATOR and
# CONTACT_EMAIL:
#   docker run --rm -p 127.0.0.1:8788:8788 --env-file .env countrytopics-frontend-worker
FROM node:22.23.4-bookworm-slim
# workerd checks HTTPS certificates against the system's store, which the
# slim image leaves out (Node carries its own): the thumbnail route
# fetches from YouTube over HTTPS.
RUN apt-get update \
  && apt-get install --yes --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*
RUN npm install --global pnpm@10.17.1
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile --filter "@countrytopics/frontend..."
WORKDIR /repo/apps/frontend
# The build reads no settings; the Worker reads them when it runs.
RUN SITE_URL= BACKEND_URL= pnpm build:worker
EXPOSE 8788
# The keys, and who runs the site for the legal pages, from the
# container's environment; the other settings are wrangler.jsonc's vars.
CMD ["sh", "-c", "printf 'FORWARDING_KEY=%s\nPURGE_KEY=%s\nSITE_OPERATOR=%s\nCONTACT_EMAIL=%s\n' \"$FORWARDING_KEY\" \"$PURGE_KEY\" \"$SITE_OPERATOR\" \"$CONTACT_EMAIL\" > .dev.vars && pnpm preview --ip 0.0.0.0 --port 8788"]
