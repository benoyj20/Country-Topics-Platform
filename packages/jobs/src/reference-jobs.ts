import {
  DOI_MAX_LENGTH,
  type IdentifierCheck,
  referenceCheckResult,
  type ReferenceCheckStatus,
  URL_MAX_LENGTH,
} from "@countrytopics/domain";
import {
  type Bibliography,
  type LinkCheck,
  SourceUnavailableError,
} from "@countrytopics/sources";
import { type JobsOptions, Queue, UnrecoverableError, Worker } from "bullmq";
import * as z from "zod";

import type { QueueSettings } from "./email-jobs.ts";

export const REFERENCE_QUEUE_NAME = "references";

/**
 * Checks a reference's identifiers as they were when it was saved. The result
 * is stored only if the reference still has exactly these identifiers. The job
 * is queued inside that save, so until it commits the worker may still see
 * the reference as it was before; requestedAt tells the two apart.
 */
export const referenceCheckJobSchema = z.object({
  requestedAt: z.iso.datetime(),
  referenceId: z.uuid(),
  doi: z.string().max(DOI_MAX_LENGTH).nullable(),
  isbn: z
    .string()
    .regex(/^\d{13}$/)
    .nullable(),
  url: z
    .url({ protocol: /^https?$/ })
    .max(URL_MAX_LENGTH)
    .nullable(),
});
export type ReferenceCheckJob = z.infer<typeof referenceCheckJobSchema>;

export const REFERENCE_JOB_OPTIONS: JobsOptions = {
  // Outside services and the saving transaction may need a while; about ten
  // minutes in total before the reference is marked "could not finish".
  attempts: 6,
  backoff: { type: "exponential", delay: 10_000 },
  removeOnComplete: true,
  // A kept job would block its id, so the same request could not be queued
  // again (see requeuePendingChecks); failures are logged by the worker and
  // stored with the reference.
  removeOnFail: true,
};

export type ReferenceCheckers = {
  bibliography: Bibliography;
  checkUrl(url: string): Promise<LinkCheck>;
};

export type ReferenceCheckResult = {
  status: Exclude<ReferenceCheckStatus, "pending">;
  message: string;
};

export type ReferenceState =
  /** Still has the job's identifiers and waits for this check. */
  | "pending"
  /** Checked or saved again since the job was requested; a newer job covers it. */
  | "superseded"
  /**
   * Not visible yet: the save that queued the job has not committed, so the
   * reference is absent or still as it was before the request.
   */
  | "missing";

export type ReferenceStore = {
  referenceState(job: ReferenceCheckJob): Promise<ReferenceState>;
  /** Stores the result if the reference is still pending with the job's identifiers. */
  saveReferenceCheck(
    job: ReferenceCheckJob,
    result: ReferenceCheckResult,
  ): Promise<boolean>;
};

export type ReferenceQueue = {
  enqueue(job: ReferenceCheckJob): Promise<void>;
  close(): Promise<void>;
};

/** One job per check request, so queueing the same request twice adds one. */
export function referenceJobId({
  referenceId,
  requestedAt,
}: ReferenceCheckJob): string {
  return `reference-${referenceId}-${Date.parse(requestedAt)}`;
}

export function createReferenceQueue({
  connection,
  prefix,
}: QueueSettings): ReferenceQueue {
  const queue = new Queue(REFERENCE_QUEUE_NAME, { connection, prefix });
  return {
    async enqueue(job) {
      const data = referenceCheckJobSchema.parse(job);
      await queue.add("check-reference", data, {
        ...REFERENCE_JOB_OPTIONS,
        jobId: referenceJobId(data),
      });
    },
    close: () => queue.close(),
  };
}

async function settle(
  identifier: IdentifierCheck["identifier"],
  check: () => Promise<Omit<IdentifierCheck, "identifier">>,
): Promise<IdentifierCheck> {
  try {
    return { identifier, ...(await check()) };
  } catch (error) {
    if (error instanceof SourceUnavailableError) {
      return { identifier, outcome: "failed", message: error.message };
    }
    throw error;
  }
}

/** Asks each identifier's registry or site whether it exists. */
export async function checkReferenceIdentifiers(
  job: ReferenceCheckJob,
  checkers: ReferenceCheckers,
): Promise<IdentifierCheck[]> {
  const checks: Promise<IdentifierCheck>[] = [];
  const { doi, isbn, url } = job;
  if (doi) {
    checks.push(
      settle("doi", async () => {
        const result = await checkers.bibliography.lookupDoi(doi);
        return result.found
          ? {
              outcome: "resolved",
              message: `Found in ${result.metadata.source}.`,
            }
          : { outcome: "not_found", message: "No such DOI is registered." };
      }),
    );
  }
  if (isbn) {
    checks.push(
      settle("isbn", async () => {
        const result = await checkers.bibliography.lookupIsbn(isbn);
        return result.found
          ? {
              outcome: "resolved",
              message: `Found in ${result.metadata.source}.`,
            }
          : {
              outcome: "not_found",
              message:
                "No book catalogue we check knows this ISBN. Check it, or add a link such as the publisher's page.",
            };
      }),
    );
  }
  if (url) checks.push(settle("url", () => checkers.checkUrl(url)));
  return Promise.all(checks);
}

export type JobAttempt = {
  /** BullMQ will not try this job again after this attempt. */
  isFinal: boolean;
};

/**
 * Runs one reference check. Throws to have BullMQ retry while the reference
 * is not visible yet or a service could not answer; on the final attempt it
 * records "could not finish" instead, whatever went wrong.
 */
export async function processReferenceCheck(
  job: ReferenceCheckJob,
  { checkers, store }: { checkers: ReferenceCheckers; store: ReferenceStore },
  { isFinal }: JobAttempt,
): Promise<"saved" | "superseded"> {
  const state = await store.referenceState(job);
  if (state === "superseded") return "superseded";
  if (state === "missing") {
    if (isFinal) return "superseded";
    throw new Error("The reference is not saved yet; trying again.");
  }

  let result: ReferenceCheckResult;
  try {
    result = referenceCheckResult(
      await checkReferenceIdentifiers(job, checkers),
    );
  } catch (error) {
    // On the last attempt, say the check could not finish rather than leave
    // the reference "being checked" for ever; the job still fails, for the logs.
    if (isFinal) {
      await store.saveReferenceCheck(job, {
        status: "failed",
        message:
          "The check failed unexpectedly. Save the reference to try again.",
      });
    }
    throw error;
  }
  if (result.status === "failed" && !isFinal) {
    throw new Error(`Reference check will be retried: ${result.message}`);
  }
  return (await store.saveReferenceCheck(job, result)) ? "saved" : "superseded";
}

export type ReferenceWorkerOptions = QueueSettings & {
  checkers: ReferenceCheckers;
  store: ReferenceStore;
  concurrency?: number;
};

export function createReferenceWorker({
  connection,
  prefix,
  checkers,
  store,
  concurrency = 2,
}: ReferenceWorkerOptions): Worker {
  return new Worker(
    REFERENCE_QUEUE_NAME,
    async (job) => {
      const parsed = referenceCheckJobSchema.safeParse(job.data);
      if (!parsed.success) {
        throw new UnrecoverableError(
          `Invalid reference check job: ${parsed.error.message}`,
        );
      }
      const attempts = job.opts.attempts ?? 1;
      return processReferenceCheck(
        parsed.data,
        { checkers, store },
        { isFinal: job.attemptsMade + 1 >= attempts },
      );
    },
    { connection, prefix, concurrency },
  );
}
