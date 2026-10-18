# The site and admin panel (ADR 0013). Built from the repository root:
#   docker build -f apps/web/Dockerfile .
# Configuration comes only from the environment at run time; the build uses
# placeholders and reaches no database (the home page it writes is never
# served: the shared cache renders it on the first visit).

FROM node:22.23.3-alpine3.24 AS build
RUN npm install --global pnpm@10.17.1
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile --filter "@countrytopics/web..."
# Placeholders that pass the configuration check; nothing connects to them.
RUN DATABASE_URL=postgres://build@127.0.0.1:1/build \
    DATABASE_REPLICA_URL= \
    PAYLOAD_SECRET=build-only-placeholder-not-used-at-run-time \
    BETTER_AUTH_SECRET=build-only-placeholder-not-used-at-run-time \
    SITE_URL=http://localhost:3000 \
    REDIS_URL=redis://127.0.0.1:1 \
    S3_BUCKET=build-placeholder \
    S3_ACCESS_KEY_ID=build \
    S3_SECRET_ACCESS_KEY=build \
    SENTRY_DSN= \
    NEXT_TELEMETRY_DISABLED=1 \
    pnpm --filter @countrytopics/web build && rm -rf apps/web/.next/cache
# Production dependencies only. The workspace layout is kept: Node runs the
# workspace packages' TypeScript, but not from inside node_modules.
RUN CI=true pnpm install --frozen-lockfile --prod --filter "@countrytopics/web..."

FROM node:22.23.3-alpine3.24
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
# The code belongs to root and the site runs as `node`, so the site cannot
# change its own code; only Next.js's cache folder is writable.
COPY --from=build /repo/package.json /repo/pnpm-workspace.yaml ./
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/packages ./packages
COPY --from=build /repo/apps/web ./apps/web
RUN mkdir -p apps/web/.next/cache && chown node:node apps/web/.next/cache
WORKDIR /app/apps/web
USER node
EXPOSE 3000
# Migrations: docker compose run --rm web node node_modules/payload/bin.js migrate
CMD ["node", "node_modules/next/dist/bin/next", "start", "--hostname", "0.0.0.0", "--port", "3000"]
