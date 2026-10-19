# The worker: email, reference, link, video, and search jobs (ADR 0013).
# Built from the repository root: docker build -f apps/worker/Dockerfile .
# Configuration comes only from the environment at run time.

FROM node:22.23.3-alpine3.24 AS build
RUN npm install --global pnpm@10.17.1
WORKDIR /repo
COPY . .
# Production dependencies only. The workspace layout is kept: Node runs the
# workspace packages' TypeScript, but not from inside node_modules.
RUN pnpm install --frozen-lockfile --prod --filter "@countrytopics/worker..."

FROM node:22.23.3-alpine3.24
ENV NODE_ENV=production
WORKDIR /app
# The code belongs to root and the worker runs as `node`, so it cannot
# change its own code.
COPY --from=build /repo/package.json /repo/pnpm-workspace.yaml ./
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/packages ./packages
COPY --from=build /repo/apps/worker ./apps/worker
WORKDIR /app/apps/worker
USER node
CMD ["node", "src/index.ts"]
