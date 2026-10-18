// @ts-check
import { readFileSync } from "node:fs";
import path from "node:path";
import { deserialize, serialize } from "node:v8";

import {
  createRedisConnection,
  DEFAULT_QUEUE_PREFIX,
  REDIS_CONNECT_TIMEOUT_MS,
} from "@countrytopics/jobs";

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
// - PAGE_CACHE_URL names its own Valkey, which may evict entries (LRU);
//   the queues' Valkey (REDIS_URL) must never evict, so the cache must not
//   fill it. Without PAGE_CACHE_URL it falls back to REDIS_URL.
// - Entries are per build: a page rendered by one build points at that
//   build's scripts, so another build must not serve it. Tag purges are
//   shared by every build, so a purge reaches old containers during a
//   rolling deploy too.
// - Entries are stored with v8.serialize, which keeps the Buffers and Maps
//   of a rendered page. An entry made before one of its tags expired is
//   treated as missing, so the page is rendered again. Times come from
//   each process's clock, as in Next.js's own cache; the web containers
//   must agree on the time (one host, or NTP).

/** Entries live at most this long; pages and data revalidate hourly. */
const ENTRY_TTL_S = 2 * 60 * 60;
const TAGS_HEADER = "x-next-cache-tags";

/**
 * @typedef {{ stale?: number; expired?: number }} TagState
 * @typedef {{ value: unknown; lastModified: number; tags: string[] }} Entry
 * @typedef {ReturnType<typeof createRedisConnection>} Redis
 */

/** @type {{ client: Redis; firstReady: Promise<unknown> } | undefined} */
let connection;
/** Build ids by the server folder they were read from. */
const buildIds = new Map();

function prefix() {
  return `${process.env.QUEUE_PREFIX?.trim() || DEFAULT_QUEUE_PREFIX}:page-cache`;
}

/**
 * The build this process serves, from Next.js's BUILD_ID beside the
 * server's compiled files; "development" for `next dev` and the tests.
 * @param {{ serverDistDir?: string } | undefined} options
 */
function readBuildId(options) {
  const dir = options?.serverDistDir;
  if (!dir) return "development";
  let id = buildIds.get(dir);
  if (!id) {
    try {
      id = readFileSync(path.join(dir, "..", "BUILD_ID"), "utf8").trim();
    } catch {
      id = "development";
    }
    buildIds.set(dir, id);
  }
  return id;
}

/**
 * The connection once it is ready. Only the first connection is waited
 * for, once for every caller together, at most the connect timeout. After
 * that, while Valkey is away, calls fail at once and pages render without
 * the cache rather than wait for it.
 * @returns {Promise<Redis>}
 */
async function redis() {
  if (!connection) {
    const url =
      process.env.PAGE_CACHE_URL?.trim() || process.env.REDIS_URL?.trim();
    if (!url) throw new Error("PAGE_CACHE_URL or REDIS_URL must be set");
    const client = createRedisConnection(url, "producer");
    // It reconnects by itself; meanwhile pages render without the cache.
    client.on("error", (error) =>
      console.warn("Page cache connection error:", error.message),
    );
    const firstReady = new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Valkey did not answer in time")),
        REDIS_CONNECT_TIMEOUT_MS,
      );
      client.once("ready", () => {
        clearTimeout(timer);
        resolve(undefined);
      });
    });
    // Callers await it below; one nobody awaits is not an error.
    firstReady.catch(() => undefined);
    connection = { client, firstReady };
  }
  const { client, firstReady } = connection;
  if (client.status === "ready") return client;
  if (client.status === "connecting" || client.status === "wait") {
    await firstReady;
    return client;
  }
  throw new Error(`Valkey is ${client.status}`);
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
  /** @param {{ serverDistDir?: string }} [options] Next.js's cache options. */
  constructor(options) {
    this.entryPrefix = `${prefix()}:entry:${readBuildId(options)}:`;
  }

  /**
   * @param {string} key
   * @param {{ tags?: string[]; softTags?: string[] }} [ctx]
   */
  async get(key, ctx) {
    if (building()) return null;
    try {
      const valkey = await redis();
      const stored = await valkey.getBuffer(this.entryPrefix + key);
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
    try {
      const valkey = await redis();
      if (data === null) {
        await valkey.del(this.entryPrefix + key);
        return;
      }
      /** @type {Entry} */
      const entry = {
        value: data,
        lastModified: Date.now(),
        tags: ctx?.tags ?? [],
      };
      await valkey.set(
        this.entryPrefix + key,
        serialize(entry),
        "EX",
        ENTRY_TTL_S,
      );
    } catch (error) {
      console.warn(
        "Page cache write failed:",
        error instanceof Error ? error.message : error,
      );
    }
  }

  /**
   * Marks tags purged for every web process and build. Without durations
   * they expire now; with them they are stale now and expire after
   * `expire` seconds, as in Next.js's own cache.
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
