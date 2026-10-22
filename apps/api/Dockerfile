# The API (ADR 0013, ADR 0014): Payload's REST API, sign-in, /api/v1, and
# /files, with no pages. Built from the repository root:
#   docker build -f apps/api/Dockerfile .
# Configuration comes only from the environment at run time; the build uses
# placeholders and reaches no database.

FROM node:22.23.3-alpine3.24 AS build
RUN npm install --global pnpm@10.17.1
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile --filter "@countrytopics/api..."
# Placeholders that pass the configuration check; nothing connects to them.
RUN DATABASE_URL=postgres://build@127.0.0.1:1/build \
    DATABASE_REPLICA_URL= \
    PAYLOAD_SECRET=build-only-placeholder-not-used-at-run-time \
    BETTER_AUTH_SECRET=build-only-placeholder-not-used-at-run-time \
    SITE_URL=http://localhost:3000 \
    FORWARDING_KEY=build-only-placeholder-not-used-at-run-time \
    REDIS_URL=redis://127.0.0.1:1 \
    S3_BUCKET=build-placeholder \
    S3_ACCESS_KEY_ID=build \
    S3_SECRET_ACCESS_KEY=build \
    SENTRY_DSN= \
    NEXT_TELEMETRY_DISABLED=1 \
    pnpm --filter @countrytopics/api build && rm -rf apps/api/.next/cache
# Production dependencies only. The workspace layout is kept: Node runs the
# workspace packages' TypeScript, but not from inside node_modules.
RUN CI=true pnpm install --frozen-lockfile --prod --filter "@countrytopics/api..."

FROM node:22.23.3-alpine3.24
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
# The code belongs to root and the API runs as `node`, so it cannot change
# its own code; only Next.js's cache folder is writable.
COPY --from=build /repo/package.json /repo/pnpm-workspace.yaml ./
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/packages ./packages
COPY --from=build /repo/apps/api ./apps/api
RUN mkdir -p apps/api/.next/cache && chown node:node apps/api/.next/cache
WORKDIR /app/apps/api
USER node
EXPOSE 3000
# Migrations: docker compose run --rm api node node_modules/payload/bin.js migrate
CMD ["node", "node_modules/next/dist/bin/next", "start", "--hostname", "0.0.0.0", "--port", "3000"]
