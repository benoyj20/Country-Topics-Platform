import {
  createEmailQueue,
  createLinkQueue,
  createRedisConnection,
  createReferenceQueue,
  type EmailQueue,
  type LinkQueue,
  type QueueSettings,
  type ReferenceQueue,
} from "@countrytopics/jobs";

import { serverEnv } from "@/env";

type Queues = {
  email: EmailQueue;
  references: ReferenceQueue;
  links: LinkQueue;
};

declare global {
  // Reused across hot reloads in development so connections do not pile up.
  var countryTopicsQueues: Queues | undefined;
}

function queues(): Queues {
  if (!globalThis.countryTopicsQueues) {
    const env = serverEnv();
    const settings: QueueSettings = {
      connection: createRedisConnection(env.redisUrl, "producer"),
      prefix: env.queuePrefix,
    };
    globalThis.countryTopicsQueues = {
      email: createEmailQueue(settings),
      references: createReferenceQueue(settings),
      links: createLinkQueue(settings),
    };
  }
  return globalThis.countryTopicsQueues;
}

/** Adds email jobs for the worker; web requests never send email themselves. */
export const emailQueue = (): EmailQueue => queues().email;

/** Asks the worker to confirm a reference's DOI, ISBN, and link. */
export const referenceQueue = (): ReferenceQueue => queues().references;

/** Asks the worker to find or make a Wayback Machine copy of a link. */
export const linkQueue = (): LinkQueue => queues().links;
