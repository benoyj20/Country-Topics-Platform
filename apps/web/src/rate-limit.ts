import {
  createRedisConnection,
  REDIS_CONNECT_TIMEOUT_MS,
} from "@countrytopics/jobs";

import { serverEnv } from "@/env";

// Limits on how often a member may write (ADR 0010), counted in Valkey so
// they hold across web containers. Each action has fixed windows that
// start with the first counted request; a request is counted only when
// every window has room, so refused attempts do not extend the wait. The
// windows' clock is Valkey's own (key expiry), never the web process's.

type Window = { max: number; windowS: number };

const MINUTE_S = 60;
const DAY_S = 24 * 60 * MINUTE_S;

export const RATE_LIMITS = {
  // Each comment also queues one search job, so this bounds those too.
  comment: [
    { max: 5, windowS: MINUTE_S },
    { max: 50, windowS: DAY_S },
  ],
  vote: [
    { max: 30, windowS: MINUTE_S },
    { max: 500, windowS: DAY_S },
  ],
  report: [
    { max: 5, windowS: 10 * MINUTE_S },
    { max: 20, windowS: DAY_S },
  ],
  "display-name": [{ max: 5, windowS: DAY_S }],
  // ADR 0011.
  feedback: [
    { max: 5, windowS: 60 * MINUTE_S },
    { max: 20, windowS: DAY_S },
  ],
  "data-export": [{ max: 10, windowS: DAY_S }],
  // Per visitor address, not member (ADR 0012): browsers' error reports.
  "error-report": [
    { max: 20, windowS: MINUTE_S },
    { max: 200, windowS: DAY_S },
  ],
} as const satisfies Record<string, readonly Window[]>;
export type RateLimitedAction = keyof typeof RATE_LIMITS;

// KEYS: one counter per window. ARGV: max and window (ms) per key, in turn.
// Returns 0 when counted, or the milliseconds until the full window opens.
const CONSUME = `
for i = 1, #KEYS do
  local count = tonumber(redis.call('GET', KEYS[i]) or '0')
  if count >= tonumber(ARGV[i * 2 - 1]) then
    local wait = redis.call('PTTL', KEYS[i])
    if wait < 0 then
      redis.call('PEXPIRE', KEYS[i], ARGV[i * 2])
      wait = tonumber(ARGV[i * 2])
    end
    return wait
  end
end
for i = 1, #KEYS do
  if redis.call('INCR', KEYS[i]) == 1 then
    redis.call('PEXPIRE', KEYS[i], ARGV[i * 2])
  end
end
return 0`;

// KEYS: the counters that one request was counted in. Takes it back.
const REFUND = `
for i = 1, #KEYS do
  if tonumber(redis.call('GET', KEYS[i]) or '0') > 0 then
    redis.call('DECR', KEYS[i])
  end
end
return 0`;

/** The counters of one member's action, one per window. */
export function rateLimitKeys(
  action: RateLimitedAction,
  subjectId: string,
): string[] {
  const prefix = serverEnv().queuePrefix;
  return RATE_LIMITS[action].map(
    (window) => `${prefix}:rate:${action}:${subjectId}:${window.windowS}`,
  );
}

type Redis = ReturnType<typeof createRedisConnection>;

declare global {
  // Reused across hot reloads in development so connections do not pile up.
  var countryTopicsRateLimitRedis: Redis | undefined;
}

/**
 * The connection, once it is ready. Commands fail at once while Valkey is
 * down (no offline queue, like the queues' producer connection), so the
 * first request after a start or a reconnect waits for it, up to the
 * connect timeout.
 */
async function redis(): Promise<Redis> {
  let connection = globalThis.countryTopicsRateLimitRedis;
  if (!connection) {
    connection = createRedisConnection(serverEnv().redisUrl, "producer");
    // It reconnects by itself; the requests meanwhile are refused (503).
    connection.on("error", (error: Error) =>
      console.error("Rate limit connection error:", error.message),
    );
    globalThis.countryTopicsRateLimitRedis = connection;
  }
  if (connection.status === "ready") return connection;
  await new Promise<void>((resolve, reject) => {
    const done = (error?: Error) => {
      clearTimeout(timer);
      connection.off("ready", onReady);
      if (error) reject(error);
      else resolve();
    };
    const onReady = () => done();
    const timer = setTimeout(
      () => done(new Error("Valkey did not answer in time.")),
      REDIS_CONNECT_TIMEOUT_MS,
    );
    connection.once("ready", onReady);
  });
  return connection;
}

export type RateLimitResult = { ok: true } | { ok: false; retryAfterS: number };

/**
 * Counts one `action` by `subjectId` if every window has room. Throws when
 * Valkey cannot be reached; callers refuse the write then, rather than
 * let it through uncounted.
 */
export async function consumeRateLimit(
  action: RateLimitedAction,
  subjectId: string,
): Promise<RateLimitResult> {
  const keys = rateLimitKeys(action, subjectId);
  const args = RATE_LIMITS[action].flatMap((window) => [
    window.max,
    window.windowS * 1_000,
  ]);
  const waitMs = Number(
    await (await redis()).eval(CONSUME, keys.length, ...keys, ...args),
  );
  return waitMs > 0
    ? { ok: false, retryAfterS: Math.ceil(waitMs / 1_000) }
    : { ok: true };
}

/**
 * Takes back one counted `action`, for a write the server then refused
 * (a locked thread, say), so refusals do not use up a member's allowance.
 */
export async function refundRateLimit(
  action: RateLimitedAction,
  subjectId: string,
): Promise<void> {
  const keys = rateLimitKeys(action, subjectId);
  await (await redis()).eval(REFUND, keys.length, ...keys);
}
