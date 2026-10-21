# The frontend built for Cloudflare Workers and run in workerd, the Workers
# runtime, on Linux: on Windows, OpenNext's build needs symbolic links that
# only Developer Mode allows (ADR 0014, phase 1). For local checks only.
# Built from the repository root:
#   docker build -f apps/frontend/Dockerfile -t countrytopics-frontend-worker .
# Run with the forwarding key the backend uses:
#   docker run --rm -p 127.0.0.1:8788:8788 -e FORWARDING_KEY=... countrytopics-frontend-worker
FROM node:22.23.3-bookworm-slim
RUN npm install --global pnpm@10.17.1
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile --filter "@countrytopics/frontend..."
WORKDIR /repo/apps/frontend
# The build reads no settings; the Worker reads them when it runs.
RUN SITE_URL= BACKEND_URL= pnpm build:worker
EXPOSE 8788
CMD ["sh", "-c", "printf 'FORWARDING_KEY=%s\n' \"$FORWARDING_KEY\" > .dev.vars && pnpm preview --ip 0.0.0.0 --port 8788"]
