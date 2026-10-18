# The backup container (ADR 0012): Node for the backup command, and the
# PostgreSQL 17 client tools (pg_dump, pg_restore) matching the server.
# Built from the repository root: docker build -f apps/backup/Dockerfile .

FROM node:22.23.3-alpine3.24 AS build
RUN npm install --global pnpm@10.17.1
WORKDIR /repo
COPY . .
# Only this app and its production dependencies, as plain files.
RUN pnpm --filter @countrytopics/backup deploy --prod --legacy /out

FROM node:22.23.3-alpine3.24
RUN apk add --no-cache postgresql17-client
WORKDIR /app
COPY --from=build --chown=node:node /out .
USER node
ENTRYPOINT ["node", "src/index.ts"]
CMD ["schedule"]
