import { createSmtpSender } from "@countrytopics/email";
import {
  createContentStore,
  createEmailWorker,
  createLinkWorker,
  createRedisConnection,
  createReferenceWorker,
} from "@countrytopics/jobs";
import {
  checkUrl,
  createBibliography,
  createWebArchive,
  SOURCE_TIMEOUT_MS,
  sourceUserAgent,
  WEB_ARCHIVE_TIMEOUT_MS,
} from "@countrytopics/sources";
import pg from "pg";

import { readWorkerEnv } from "./env.ts";

const DATABASE_CONNECT_TIMEOUT_MS = 5_000;

const env = readWorkerEnv();
const connection = createRedisConnection(env.redisUrl, "worker");
const pool = new pg.Pool({
  connectionString: env.databaseUrl,
  connectionTimeoutMillis: DATABASE_CONNECT_TIMEOUT_MS,
  max: 4,
});
const store = createContentStore(pool);
const sourceClient = {
  fetch,
  userAgent: sourceUserAgent(env),
  timeoutMs: SOURCE_TIMEOUT_MS,
};
const queues = { connection, prefix: env.queuePrefix };

const workers: Record<string, ReturnType<typeof createEmailWorker>> = {
  email: createEmailWorker({
    ...queues,
    sender: createSmtpSender({ smtpUrl: env.smtpUrl, from: env.emailFrom }),
  }),
  references: createReferenceWorker({
    ...queues,
    store,
    checkers: {
      bibliography: createBibliography(sourceClient),
      checkUrl: (url) => checkUrl(url, { userAgent: sourceClient.userAgent }),
    },
  }),
  links: createLinkWorker({
    ...queues,
    store,
    archive: createWebArchive(
      { ...sourceClient, timeoutMs: WEB_ARCHIVE_TIMEOUT_MS },
      env.wayback,
    ),
  }),
};

// Log the job id and error only: email jobs contain sign-in links.
for (const [name, worker] of Object.entries(workers)) {
  worker.on("failed", (job, error) => {
    console.error(
      `${name} job ${job?.id ?? "unknown"} failed (attempt ${job?.attemptsMade ?? "?"}):`,
      error.message,
    );
  });
  worker.on("error", (error) => {
    console.error(`${name} worker error:`, error.message);
  });
}

console.log(
  `Worker started: queues ${Object.keys(workers).join(", ")}, prefix "${env.queuePrefix}"; Wayback Machine ${env.wayback ? "saving enabled" : "search only (no keys)"}`,
);

// Containers stop with SIGTERM; finish in-flight jobs, then release Redis and
// the database.
async function shutDown(signal: string): Promise<void> {
  console.log(`${signal} received; finishing in-flight jobs`);
  await Promise.all(Object.values(workers).map((worker) => worker.close()));
  await Promise.all([connection.quit(), pool.end()]);
  process.exit(0);
}

process.once("SIGTERM", () => void shutDown("SIGTERM"));
process.once("SIGINT", () => void shutDown("SIGINT"));
