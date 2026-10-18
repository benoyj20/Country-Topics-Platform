// @ts-check
import { deserialize, serialize } from "node:v8";

import { Redis } from "ioredis";

// The shared page cache (ADR 0013): Next.js's cache of pages and
// unstable_cache data kept in Valkey instead of each web process's memory
// and disk, so every web container serves the same pages and a purge on
// one reaches all of them (AGENTS.md: "shared page cache in Redis").
//
// Plain JavaScript: Next.js imports this file itself at run time, outside
// its bundles. It makes a new handler for each request, so the connection
// and all state live outside the instances: the connection in this module,
// the entries and tag purges in Valkey.
//
// Entries are stored with v8.serialize, which keeps the Buffers and Maps
// of a rendered page. Purges record when each tag expired; an entry made
// before its tag expired is treated as missing, so the page is rendered
// again. Times come from each process's clock, as in Next.js's own cache;
// the web containers must agree on the time (one host, or NTP).

/** Entries unused for this long are dropped; pages revalidate hourly anyway. */
const ENTRY_TTL_S = 7 * 24 * 60 * 60;
const CONNECT_TIMEOUT_MS = 5_000;
/** A slow cache must not hold up pages; a miss renders them instead. */
const COMMAND_TIMEOUT_MS = 2_000;
const TAGS_HEADER = "x-next-cache-tags";

/**
 * @typedef {{ stale?: number; expired?: number }} TagState
 * @typedef {{ value: unknown; lastModified: number; tags: string[] }} Entry
 */

/** @type {Redis | undefined} */
let connection;

function prefix() {
  return `${process.env.QUEUE_PREFIX?.trim() || "countrytopics"}:page-cache`;
}

/** @returns {Redis} */
function client() {
  if (!connection) {
    const url = process.env.REDIS_URL?.trim();
    if (!url) throw new Error("REDIS_URL is not set");
    connection = new Redis(url, {
      connectTimeout: CONNECT_TIMEOUT_MS,
      commandTimeout: COMMAND_TIMEOUT_MS,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    });
    // It reconnects by itself; meanwhile pages render without the cache.
    connection.on("error", (error) =>
      console.warn("Page cache connection error:", error.message),
    );
  }
  return connection;
}

/**
 * The connection once it is ready. Commands fail at once while it is not
 * (no offline queue), so the first request after a start waits for it,
 * briefly: a cache that cannot be reached is a miss, not an outage.
 * @returns {Promise<Redis>}
 */
async function redis() {
  const redis = client();
  if (redis.status === "ready") return redis;
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      redis.off("ready", onReady);
      reject(new Error("Valkey did not answer in time"));
    }, COMMAND_TIMEOUT_MS);
    const onReady = () => {
      clearTimeout(timer);
      resolve(undefined);
    };
    redis.once("ready", onReady);
  });
  return redis;
}

/** During `next build` there is no Valkey to reach, and nothing to share. */
function building() {
  return process.env.NEXT_PHASE === "phase-production-build";
}

/**
 * Every tag an entry depends on: those it was stored with, those the
 * request names, and, for a page, those in its tags header.
 * @param {Entry} entry
 * @param {{ tags?: string[]; softTags?: string[] } | undefined} ctx
 * @returns {string[]}
 */
export function entryTags(entry, ctx) {
  const value = /** @type {{ headers?: Record<string, unknown> } | null} */ (
    entry.value
  );
  const header = value?.headers?.[TAGS_HEADER];
  return [
    ...new Set([
      ...entry.tags,
      ...(ctx?.tags ?? []),
      ...(ctx?.softTags ?? []),
      ...(typeof header === "string" ? header.split(",") : []),
    ]),
  ].filter(Boolean);
}

/**
 * Whether an entry made at `lastModified` is gone (a tag expired after it
 * was made) or stale (a tag was marked stale after it was made), as
 * Next.js's own cache decides.
 * @param {(TagState | null)[]} states
 * @param {number} lastModified
 * @param {number} now
 * @returns {"fresh" | "stale" | "expired"}
 */
export function entryState(states, lastModified, now) {
  let stale = false;
  for (const state of states) {
    if (!state) continue;
    if (
      typeof state.expired === "number" &&
      state.expired <= now &&
      state.expired > lastModified
    ) {
      return "expired";
    }
    if (typeof state.stale === "number" && state.stale > lastModified) {
      stale = true;
    }
  }
  return stale ? "stale" : "fresh";
}

/** @param {string | null} text @returns {TagState | null} */
function parseTagState(text) {
  if (!text) return null;
  try {
    const value = JSON.parse(text);
    return typeof value === "object" && value !== null ? value : null;
  } catch {
    return null;
  }
}

export default class SharedCacheHandler {
  /**
   * @param {string} key
   * @param {{ tags?: string[]; softTags?: string[] }} [ctx]
   */
  async get(key, ctx) {
    if (building()) return null;
    try {
      const valkey = await redis();
      const stored = await valkey.getBuffer(`${prefix()}:entry:${key}`);
      if (!stored) return null;
      const entry = /** @type {Entry} */ (deserialize(stored));
      const tags = entryTags(entry, ctx);
      const states =
        tags.length > 0
          ? (await valkey.hmget(`${prefix()}:tags`, ...tags)).map(parseTagState)
          : [];
      const state = entryState(states, entry.lastModified, Date.now());
      if (state === "expired") return null;
      return {
        value: entry.value,
        // A stale entry is served once more while Next.js renders a new
        // one; an old time makes it look due for revalidation.
        lastModified: state === "stale" ? 1 : entry.lastModified,
      };
    } catch (error) {
      console.warn(
        "Page cache read failed; rendering instead:",
        error instanceof Error ? error.message : error,
      );
      return null;
    }
  }

  /**
   * @param {string} key
   * @param {unknown} data
   * @param {{ tags?: string[] }} [ctx]
   */
  async set(key, data, ctx) {
    if (building()) return;
    const entryKey = `${prefix()}:entry:${key}`;
    try {
      if (data === null) {
        await (await redis()).del(entryKey);
        return;
      }
      /** @type {Entry} */
      const entry = {
        value: data,
        lastModified: Date.now(),
        tags: ctx?.tags ?? [],
      };
      await (await redis()).set(entryKey, serialize(entry), "EX", ENTRY_TTL_S);
    } catch (error) {
      console.warn(
        "Page cache write failed:",
        error instanceof Error ? error.message : error,
      );
    }
  }

  /**
   * Marks tags purged for every web process. Without durations they expire
   * now; with them they are stale now and expire after `expire` seconds,
   * as in Next.js's own cache.
   * @param {string | string[]} tags
   * @param {{ expire?: number }} [durations]
   */
  async revalidateTag(tags, durations) {
    const list = [tags].flat();
    if (list.length === 0 || building()) return;
    const now = Date.now();
    /** @type {TagState} */
    const state = durations
      ? {
          stale: now,
          ...(durations.expire !== undefined
            ? { expired: now + durations.expire * 1_000 }
            : {}),
        }
      : { expired: now };
    try {
      await (
        await redis()
      ).hset(
        `${prefix()}:tags`,
        Object.fromEntries(list.map((tag) => [tag, JSON.stringify(state)])),
      );
    } catch (error) {
      // An error, which error reporting sends on: until the hourly
      // revalidation, other web processes keep the old pages.
      console.error(
        `Page cache purge failed for ${list.join(", ")}:`,
        error instanceof Error ? error.message : error,
      );
      throw error;
    }
  }

  resetRequestCache() {}
}
