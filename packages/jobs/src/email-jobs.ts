import {
  type EmailMessage,
  type EmailSender,
  magicLinkEmail,
} from "@countrytopics/email";
import { type JobsOptions, Queue, UnrecoverableError, Worker } from "bullmq";
import type { Redis } from "ioredis";
import * as z from "zod";

export const EMAIL_QUEUE_NAME = "email";

/** The longest a sign-in link may stay valid; anything longer is a bug. */
const MAX_LINK_EXPIRY_MINUTES = 60;

export const emailJobSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("magic-link"),
    to: z.email(),
    url: z.url({ protocol: /^https?$/ }),
    expiresInMinutes: z.number().int().positive().max(MAX_LINK_EXPIRY_MINUTES),
  }),
]);
export type EmailJob = z.infer<typeof emailJobSchema>;

export const EMAIL_JOB_OPTIONS: JobsOptions = {
  attempts: 5,
  backoff: { type: "exponential", delay: 5_000 },
  // Jobs carry sign-in links; keep them only as long as needed to debug failures.
  removeOnComplete: true,
  removeOnFail: { age: 24 * 60 * 60 },
};

export type QueueSettings = {
  connection: Redis;
  /** Key prefix in Redis; tests use their own so they never meet the dev worker. */
  prefix: string;
};

export type EmailQueue = {
  enqueue(job: EmailJob): Promise<void>;
  close(): Promise<void>;
};

export function createEmailQueue({
  connection,
  prefix,
}: QueueSettings): EmailQueue {
  const queue = new Queue(EMAIL_QUEUE_NAME, { connection, prefix });
  return {
    async enqueue(job) {
      const data = emailJobSchema.parse(job);
      await queue.add(data.kind, data, EMAIL_JOB_OPTIONS);
    },
    close: () => queue.close(),
  };
}

export function renderEmailJob(job: EmailJob): EmailMessage {
  switch (job.kind) {
    case "magic-link":
      return magicLinkEmail(job);
  }
}

export type EmailWorkerOptions = QueueSettings & {
  sender: EmailSender;
  concurrency?: number;
};

export function createEmailWorker({
  connection,
  prefix,
  sender,
  concurrency = 5,
}: EmailWorkerOptions): Worker {
  return new Worker(
    EMAIL_QUEUE_NAME,
    async (job) => {
      const parsed = emailJobSchema.safeParse(job.data);
      // Malformed data will never succeed, so do not retry it.
      if (!parsed.success) {
        throw new UnrecoverableError(
          `Invalid email job: ${parsed.error.message}`,
        );
      }
      await sender.send(renderEmailJob(parsed.data));
    },
    { connection, prefix, concurrency },
  );
}
