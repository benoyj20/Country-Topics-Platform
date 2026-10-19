import { Redis } from "ioredis";

export const REDIS_CONNECT_TIMEOUT_MS = 5_000;
/** QUEUE_PREFIX when unset: the start of every key the site keeps in Valkey. */
export const DEFAULT_QUEUE_PREFIX = "countrytopics";

export type RedisRole =
  /** Web requests that add jobs: fail fast instead of queueing commands while Redis is down. */
  | "producer"
  /** The worker: keep retrying, because BullMQ workers block on Redis by design. */
  | "worker";

/** A connection to Redis or Valkey (`REDIS_URL`) configured for BullMQ. */
export function createRedisConnection(
  redisUrl: string,
  role: RedisRole,
): Redis {
  return new Redis(redisUrl, {
    connectTimeout: REDIS_CONNECT_TIMEOUT_MS,
    // BullMQ requires this for workers; producers bound commands with the offline
    // queue switch below instead.
    maxRetriesPerRequest: role === "worker" ? null : 1,
    enableOfflineQueue: role === "worker",
  });
}
