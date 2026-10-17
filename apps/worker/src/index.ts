import { createSmtpSender } from "@countrytopics/email";
import {
  createContentStore,
  createEmailWorker,
  createLinkWorker,
  createRedisConnection,
  createReferenceQueue,
  createReferenceWorker,
  createSearchQueue,
  createSearchWorker,
  createTopicSearchSource,
  createVideoQueue,
  createVideoWorker,
  requeuePendingChecks,
} from "@countrytopics/jobs";
import { createPostgresTopicSearch } from "@countrytopics/search";
import {
  checkUrl,
  createBibliography,
  createWebArchive,
  createYouTube,
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
      bibliography: createBibliography(sourceClient, {
        googleBooksApiKey: env.googleBooksApiKey,
        onBackupError: (message) =>
          console.warn(`ISBN check backup failed: ${message}`),
      }),
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
  // The search index is a table in the same database (ADR 0008).
  search: createSearchWorker({
    ...queues,
    source: createTopicSearchSource(pool),
    index: createPostgresTopicSearch(pool),
  }),
  videos: createVideoWorker({
    ...queues,
    store,
    youtube: createYouTube(sourceClient, {
      dataApiKey: env.youtubeApiKey,
      onDataApiError: (message) =>
        console.warn(`Video check without the Data API: ${message}`),
    }),
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
  `Worker started: queues ${Object.keys(workers).join(", ")}, prefix "${env.queuePrefix}"; Wayback Machine ${env.wayback ? "saving enabled" : "search only (no keys)"}; Google Books backup ${env.googleBooksApiKey ? "on" : "off"}; YouTube Data API ${env.youtubeApiKey ? "on" : "off"}`,
);

// Checks lost while no worker ran (or queued by an older version) are queued
// again; job ids are per request, so several workers starting add each once.
const producer = createRedisConnection(env.redisUrl, "producer");
const checkQueues = {
  references: createReferenceQueue({
    connection: producer,
    prefix: env.queuePrefix,
  }),
  videos: createVideoQueue({ connection: producer, prefix: env.queuePrefix }),
};
const searchQueue = createSearchQueue({
  connection: producer,
  prefix: env.queuePrefix,
});
requeuePendingChecks(store, checkQueues, (message) => console.warn(message))
  .then(({ references, videos }) =>
    console.log(
      `Pending checks queued again: ${references} references, ${videos} videos`,
    ),
  )
  .catch((error: unknown) =>
    console.error(
      "Could not queue pending checks again:",
      error instanceof Error ? error.message : error,
    ),
  );

// The search index is rebuilt from the database now, which fills it after a
// migration or a lost job, and then every hour; one schedule is shared by
// every worker.
searchQueue
  .scheduleRebuilds()
  .catch((error: unknown) =>
    console.error(
      "Could not schedule search index rebuilds:",
      error instanceof Error ? error.message : error,
    ),
  );

// Containers stop with SIGTERM; finish in-flight jobs, then release Redis and
// the database.
async function shutDown(signal: string): Promise<void> {
  console.log(`${signal} received; finishing in-flight jobs`);
  await Promise.all(Object.values(workers).map((worker) => worker.close()));
  await Promise.all([
    checkQueues.references.close(),
    checkQueues.videos.close(),
    searchQueue.close(),
  ]);
  await Promise.all([connection.quit(), producer.quit(), pool.end()]);
  process.exit(0);
}

process.once("SIGTERM", () => void shutDown("SIGTERM"));
process.once("SIGINT", () => void shutDown("SIGINT"));
