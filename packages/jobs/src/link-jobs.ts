import type { LinkArchiveStatus } from "@countrytopics/domain";
import {
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
import { URL_MAX_LENGTH } from "./reference-jobs.ts";

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
  enqueue(job: LinkArchiveJob): Promise<void>;
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
    async enqueue(job) {
      const data = linkArchiveJobSchema.parse(job);
      await queue.add("archive-link", data, {
        ...LINK_JOB_OPTIONS,
        jobId: linkJobId(data.url),
      });
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

/**
 * Saves a fresh copy when keys are configured (an older copy may not show
 * what the admin cited), otherwise or when saving is refused falls back to
 * the closest existing copy.
 */
async function archiveLink(
  url: string,
  { archive, wait = sleep }: LinkArchiveDeps,
): Promise<LinkArchiveRecord> {
  let refusal: string | null = null;
  if (archive.canCapture) {
    const request = await archive.requestCapture(url);
    if ("refused" in request) {
      refusal = request.refused;
    } else {
      for (let poll = 0; poll < CAPTURE_MAX_POLLS && !refusal; poll += 1) {
        await wait(CAPTURE_POLL_INTERVAL_MS);
        const status = await archive.captureStatus(request.jobId);
        if (status.state === "saved") {
          return archived(status.snapshot, "Saved by the Wayback Machine.");
        }
        if (status.state === "refused") refusal = status.message;
      }
      if (!refusal) {
        throw new SourceUnavailableError(
          "The Wayback Machine",
          "is still saving the page",
        );
      }
    }
  }
  const snapshot = await archive.findSnapshot(url);
  if (snapshot) {
    return archived(
      snapshot,
      refusal
        ? `A new copy could not be saved (${refusal}); this is the closest earlier copy.`
        : "The closest copy in the Wayback Machine.",
    );
  }
  return {
    status: "not_archived",
    archiveUrl: null,
    capturedAt: null,
    message: refusal ?? NO_KEYS_MESSAGE,
  };
}

/**
 * Runs one archive job. Throws to have BullMQ retry while the Internet
 * Archive cannot answer; on the final attempt it records "failed" instead.
 */
export async function processLinkArchive(
  { url }: LinkArchiveJob,
  deps: LinkArchiveDeps,
  { isFinal }: JobAttempt,
): Promise<"saved" | "skipped"> {
  if ((await deps.store.linkArchiveStatus(url)) === "archived")
    return "skipped";
  let record: LinkArchiveRecord;
  try {
    record = await archiveLink(url, deps);
  } catch (error) {
    if (!(error instanceof SourceUnavailableError) || !isFinal) throw error;
    record = {
      status: "failed",
      archiveUrl: null,
      capturedAt: null,
      message: `${error.message} Save the topic again later to retry.`,
    };
  }
  await deps.store.saveLinkArchive(url, record);
  return "saved";
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
