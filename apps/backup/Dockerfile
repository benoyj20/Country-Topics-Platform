# The backup container (ADR 0012): Node for the backup command, and the
# PostgreSQL 17 client tools (pg_dump, pg_restore) matching the server.
# Built from the repository root: docker build -f apps/backup/Dockerfile .

FROM node:22.23.3-alpine3.24 AS build
RUN npm install --global pnpm@10.17.1
WORKDIR /repo
COPY . .
# This app and the workspace packages it uses, with production
# dependencies only. The workspace layout is kept: Node runs TypeScript
# directly but not from inside node_modules, and pnpm links workspace
# packages to their own folders.
RUN pnpm install --frozen-lockfile --prod --filter "@countrytopics/backup..."

FROM node:22.23.3-alpine3.24
RUN apk add --no-cache postgresql17-client
WORKDIR /app
# The code belongs to root and the command runs as `node`, so it cannot
# change its own code; it writes only temporary files.
COPY --from=build /repo/package.json /repo/pnpm-workspace.yaml ./
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/packages/observability ./packages/observability
COPY --from=build /repo/apps/backup ./apps/backup
WORKDIR /app/apps/backup
USER node
ENTRYPOINT ["node", "src/index.ts"]
CMD ["schedule"]
