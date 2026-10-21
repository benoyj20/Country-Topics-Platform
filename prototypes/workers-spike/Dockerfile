# The Workers spike (ADR 0014, phases 1 and 2), built and previewed on Linux: on
# Windows, OpenNext's build needs symbolic links that only Developer Mode
# allows. workerd needs glibc, so this is Debian, not Alpine. Throwaway.
# Built from the repository root:
#   docker build -f prototypes/workers-spike/Dockerfile -t countrytopics-workers-spike .
FROM node:22.23.3-bookworm-slim
RUN npm install --global pnpm@10.17.1
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile --filter "@countrytopics/workers-spike..."
WORKDIR /repo/prototypes/workers-spike
# Fonts are downloaded here, at build time, as on the real site.
RUN pnpm build:worker
EXPOSE 8787 3102
# The stand-in backend and "Sentry", then the local Workers preview.
# The backend listens on all addresses so the host can reach its test routes.
CMD ["sh", "-c", "BACKEND_HOST=0.0.0.0 node backend.mjs fixtures/*.json & pnpm preview --ip 0.0.0.0 --port 8787"]
