import {
  createEmailQueue,
  createRedisConnection,
  type EmailQueue,
} from "@countrytopics/jobs";

import { serverEnv } from "@/env";

declare global {
  // Reused across hot reloads in development so connections do not pile up.
  var countryTopicsEmailQueue: EmailQueue | undefined;
}

/** Adds email jobs for the worker; web requests never send email themselves. */
export function emailQueue(): EmailQueue {
  if (!globalThis.countryTopicsEmailQueue) {
    const env = serverEnv();
    globalThis.countryTopicsEmailQueue = createEmailQueue({
      connection: createRedisConnection(env.redisUrl, "producer"),
      prefix: env.queuePrefix,
    });
  }
  return globalThis.countryTopicsEmailQueue;
}
