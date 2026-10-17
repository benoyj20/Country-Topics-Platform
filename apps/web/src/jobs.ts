import {
  createEmailQueue,
  createLinkQueue,
  createRedisConnection,
  createReferenceQueue,
  createVideoQueue,
  type EmailQueue,
  type LinkQueue,
  type QueueSettings,
  type ReferenceQueue,
  type VideoQueue,
} from "@countrytopics/jobs";

import { serverEnv } from "@/env";

type Queues = {
  email: EmailQueue;
  references: ReferenceQueue;
  links: LinkQueue;
  videos: VideoQueue;
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
      videos: createVideoQueue(settings),
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

/** Asks the worker whether a YouTube video exists and may be embedded. */
export const videoQueue = (): VideoQueue => queues().videos;
