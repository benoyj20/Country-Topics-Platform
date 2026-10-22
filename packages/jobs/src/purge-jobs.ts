import {
  PURGE_PATH,
  PurgeAnswer,
  PurgeRequest,
} from "@countrytopics/contracts";
import { signPurge } from "@countrytopics/forwarding";
import { type JobsOptions, Queue, UnrecoverableError, Worker } from "bullmq";

import type { QueueSettings } from "./email-jobs.ts";

export const PURGE_QUEUE_NAME = "purges";

/**
 * Purges the site's cache (ADR 0014, "Cache and purges"): the backend
 * queues the tags it has just purged in its own cache, and the worker sends
 * them to the site's POST /api/revalidate, signed with the purge key.
 */
export const purgeJobSchema = PurgeRequest;
export type PurgeJob = PurgeRequest;

export const PURGE_JOB_OPTIONS: JobsOptions = {
  // While the site cannot be reached, tried again for about eight minutes
  // (1 s, doubling); after that the hourly revalidation refreshes its pages.
  attempts: 10,
  backoff: { type: "exponential", delay: 1_000 },
  removeOnComplete: true,
  removeOnFail: { age: 24 * 60 * 60 },
};

/** How long the site has to answer a purge. */
export const PURGE_TIMEOUT_MS = 10_000;

/**
 * The answers below 500 a retry can change: a timeout, a rate limit, and a
 * refused signature while the key is being changed in both places.
 */
const RETRIED_STATUSES = new Set([403, 408, 429]);

export type PurgeQueue = {
  enqueue(job: PurgeJob): Promise<void>;
  close(): Promise<void>;
};

export function createPurgeQueue({
  connection,
  prefix,
}: QueueSettings): PurgeQueue {
  const queue = new Queue(PURGE_QUEUE_NAME, { connection, prefix });
  return {
    async enqueue(job) {
      // No job ids: a purge already sent may have reached the site before
      // this change, so every purge is sent.
      await queue.add("purge", purgeJobSchema.parse(job), PURGE_JOB_OPTIONS);
    },
    close: () => queue.close(),
  };
}

export type SitePurger = {
  /** The site's origin, which the purge is sent to. */
  siteUrl: string;
  purgeKey: string;
  fetch: typeof fetch;
};

/**
 * Sends one purge to the site. Throws to have BullMQ try again when the
 * site cannot be reached or fails (5xx), or with RETRIED_STATUSES; any
 * other answer, such as a purge refused as malformed, no retry changes.
 */
export async function sendPurge(
  { siteUrl, purgeKey, fetch }: SitePurger,
  job: PurgeJob,
  now: number = Date.now(),
): Promise<PurgeAnswer> {
  const body = JSON.stringify(purgeJobSchema.parse(job));
  const response = await fetch(new URL(PURGE_PATH, siteUrl), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(await signPurge(purgeKey, body, now)),
    },
    body,
    redirect: "manual",
    signal: AbortSignal.timeout(PURGE_TIMEOUT_MS),
  });
  if (!response.ok) {
    await response.body?.cancel();
    const message = `The site answered the purge with ${response.status}.`;
    if (response.status < 500 && !RETRIED_STATUSES.has(response.status)) {
      throw new UnrecoverableError(message);
    }
    throw new Error(message);
  }
  return PurgeAnswer.parse(await response.json());
}

export type PurgeWorkerOptions = QueueSettings & {
  /** Null where there is no site to purge (the scale rehearsal). */
  purger: SitePurger | null;
};

export function createPurgeWorker({
  connection,
  prefix,
  purger,
}: PurgeWorkerOptions): Worker {
  return new Worker(
    PURGE_QUEUE_NAME,
    async (job) => {
      const parsed = purgeJobSchema.safeParse(job.data);
      if (!parsed.success) {
        throw new UnrecoverableError(
          `Invalid purge job: ${parsed.error.message}`,
        );
      }
      // Without a site the job is done: nothing would ever receive it.
      if (!purger) return { purged: [] };
      return sendPurge(purger, parsed.data);
    },
    { connection, prefix, concurrency: 5 },
  );
}
