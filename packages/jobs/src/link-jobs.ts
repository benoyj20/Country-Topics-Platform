import { type LinkArchiveStatus, URL_MAX_LENGTH } from "@countrytopics/domain";
import {
  ArchiveRefusedError,
  type Snapshot,
  SourceUnavailableError,
  type WebArchive,
} from "@countrytopics/sources";
import { type JobsOptions, Queue, UnrecoverableError, Worker } from "bullmq";
import { createHash } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import * as z from "zod";

import type { QueueSettings } from "./email-jobs.ts";
import type { JobAttempt } from "./reference-jobs.ts";

export const LINK_QUEUE_NAME = "links";

/** Finds or makes a Wayback Machine copy of a link used as evidence. */
export const linkArchiveJobSchema = z.object({
  url: z.url({ protocol: /^https?$/ }).max(URL_MAX_LENGTH),
});
export type LinkArchiveJob = z.infer<typeof linkArchiveJobSchema>;

export const LINK_JOB_OPTIONS: JobsOptions = {
  // The Internet Archive rate-limits and is sometimes slow; spread retries
  // over about half an hour.
  attempts: 5,
  backoff: { type: "exponential", delay: 60_000 },
  // A kept job would block its fixed id, so saving the topic again could not
  // queue the link again; the failure is stored with the link instead.
  removeOnComplete: true,
  removeOnFail: true,
};

/** Save Page Now usually finishes within a minute. */
const CAPTURE_POLL_INTERVAL_MS = 5_000;
const CAPTURE_MAX_POLLS = 24;

const NO_KEYS_MESSAGE =
  "The Wayback Machine has no copy yet. Add Internet Archive keys so the worker can save one, or paste a link to another archive.";

export type LinkArchiveRecord = {
  status: LinkArchiveStatus;
  archiveUrl: string | null;
  capturedAt: string | null;
  message: string;
};

export type LinkArchiveStore = {
  linkArchiveStatus(url: string): Promise<LinkArchiveStatus | null>;
  saveLinkArchive(url: string, record: LinkArchiveRecord): Promise<void>;
};

export type LinkQueue = {
  /** Adds the jobs in one round trip; links already waiting are not added twice. */
  enqueueMany(jobs: LinkArchiveJob[]): Promise<void>;
  close(): Promise<void>;
};

/** One waiting job per link, however many topics save it meanwhile. */
export function linkJobId(url: string): string {
  return `link-${createHash("sha256").update(url).digest("hex").slice(0, 32)}`;
}

export function createLinkQueue({
  connection,
  prefix,
}: QueueSettings): LinkQueue {
  const queue = new Queue(LINK_QUEUE_NAME, { connection, prefix });
  return {
    async enqueueMany(jobs) {
      const data = jobs.map((job) => linkArchiveJobSchema.parse(job));
      await queue.addBulk(
        data.map((job) => ({
          name: "archive-link",
          data: job,
          opts: { ...LINK_JOB_OPTIONS, jobId: linkJobId(job.url) },
        })),
      );
    },
    close: () => queue.close(),
  };
}

export type LinkArchiveDeps = {
  archive: WebArchive;
  store: LinkArchiveStore;
  /** Tests replace the wait between capture status checks. */
  wait?: (ms: number) => Promise<unknown>;
};

function archived(snapshot: Snapshot, message: string): LinkArchiveRecord {
  return {
    status: "archived",
    archiveUrl: snapshot.archiveUrl,
    capturedAt: snapshot.capturedAt,
    message,
  };
}

/** Asks Save Page Now for a fresh copy and waits for it, or for its refusal. */
async function capture(
  url: string,
  archive: WebArchive,
  wait: (ms: number) => Promise<unknown>,
): Promise<Snapshot | { refused: string }> {
  const request = await archive.requestCapture(url);
  if ("refused" in request) return request;
  for (let poll = 0; poll < CAPTURE_MAX_POLLS; poll += 1) {
    await wait(CAPTURE_POLL_INTERVAL_MS);
    const status = await archive.captureStatus(request.jobId);
    if (status.state === "saved") return status.snapshot;
    if (status.state === "refused") return { refused: status.message };
  }
  throw new SourceUnavailableError(
    "The Wayback Machine",
    "is still saving the page",
  );
}

/**
 * Saves a fresh copy when keys are configured (an older copy may not show
 * what the admin cited). When there are no keys, or saving is refused or fails
 * for now, it falls back to the latest existing copy.
 */
async function archiveLink(
  url: string,
  { archive, wait = sleep }: LinkArchiveDeps,
): Promise<LinkArchiveRecord> {
  let refusal: string | null = null;
  let captureError: SourceUnavailableError | null = null;
  if (archive.canCapture) {
    try {
      const result = await capture(url, archive, wait);
      if (!("refused" in result)) {
        return archived(result, "Saved by the Wayback Machine.");
      }
      refusal = result.refused;
    } catch (error) {
      if (!(error instanceof SourceUnavailableError)) throw error;
      captureError = error;
    }
  }

  let snapshot: Snapshot | null;
  try {
    snapshot = await archive.findSnapshot(url);
  } catch (error) {
    if (!(error instanceof ArchiveRefusedError)) throw error;
    return {
      status: "not_archived",
      archiveUrl: null,
      capturedAt: null,
      message: `${error.message} Paste a copy from another archive.`,
    };
  }
  const notSaved = refusal ?? captureError?.message;
  if (snapshot) {
    return archived(
      snapshot,
      notSaved
        ? `A new copy could not be saved (${notSaved}); this is the closest earlier copy.`
        : "The closest copy in the Wayback Machine.",
    );
  }
  // Saving may work on a later try.
  if (captureError) throw captureError;
  return {
    status: "not_archived",
    archiveUrl: null,
    capturedAt: null,
    message: refusal ?? NO_KEYS_MESSAGE,
  };
}

/**
 * Runs one archive job. Throws to have BullMQ retry; on the final attempt it
 * records "failed" instead, so the link never stays waiting without a reason.
 */
export async function processLinkArchive(
  { url }: LinkArchiveJob,
  deps: LinkArchiveDeps,
  { isFinal }: JobAttempt,
): Promise<"saved" | "skipped"> {
  if ((await deps.store.linkArchiveStatus(url)) === "archived")
    return "skipped";
  try {
    await deps.store.saveLinkArchive(url, await archiveLink(url, deps));
    return "saved";
  } catch (error) {
    if (!isFinal) throw error;
    const temporary = error instanceof SourceUnavailableError;
    await deps.store.saveLinkArchive(url, {
      status: "failed",
      archiveUrl: null,
      capturedAt: null,
      message: `${temporary ? error.message : "Archiving failed unexpectedly."} Save the topic again later to retry.`,
    });
    // An unexpected error is still reported as a failed job, for the logs.
    if (!temporary) throw error;
    return "saved";
  }
}

export type LinkWorkerOptions = QueueSettings &
  LinkArchiveDeps & { concurrency?: number };

export function createLinkWorker({
  connection,
  prefix,
  concurrency = 2,
  ...deps
}: LinkWorkerOptions): Worker {
  return new Worker(
    LINK_QUEUE_NAME,
    async (job) => {
      const parsed = linkArchiveJobSchema.safeParse(job.data);
      if (!parsed.success) {
        throw new UnrecoverableError(
          `Invalid link archive job: ${parsed.error.message}`,
        );
      }
      const attempts = job.opts.attempts ?? 1;
      return processLinkArchive(parsed.data, deps, {
        isFinal: job.attemptsMade + 1 >= attempts,
      });
    },
    { connection, prefix, concurrency },
  );
}
