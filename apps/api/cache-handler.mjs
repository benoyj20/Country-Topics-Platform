// @ts-check
import { readFileSync } from "node:fs";
import path from "node:path";
import { deserialize, serialize } from "node:v8";

import { PUBLIC_TAGS } from "@countrytopics/contracts";
import {
  createPurgeQueue,
  createRedisConnection,
  DEFAULT_QUEUE_PREFIX,
  REDIS_CONNECT_TIMEOUT_MS,
} from "@countrytopics/jobs";

// The shared cache (ADR 0013): Next.js's cache, here the unstable_cache
// data behind the page-data endpoints (the API renders no pages since ADR
// 0014), kept in Valkey instead of each API process's memory and disk, so
// every API container serves the same data and a purge on one reaches all
// of them.
//
// Plain JavaScript: Next.js imports this file itself at run time, outside
// its bundles. It makes a new handler for each request, so the connection
// and all state live outside the instances: the connection in this module,
// the entries and tag purges in Valkey.
//
// - PAGE_CACHE_URL names its own Valkey, which may evict entries (LRU);
//   the queues' Valkey (REDIS_URL) must never evict, so the cache must not
//   fill it. Without PAGE_CACHE_URL it falls back to REDIS_URL.
// - Entries are per build: data loaded by one build has that build's
//   shape, so another build must not serve it. Tag purges are
//   shared by every build, so a purge reaches old containers during a
//   rolling deploy too.
// - Entries are stored with v8.serialize, which keeps the Buffers and Maps
//   of a rendered page. An entry made before one of its tags expired is
//   treated as missing, so the data is loaded again. Times come from
//   each process's clock, as in Next.js's own cache; the API containers
//   must agree on the time (one host, or NTP).
// - A purge of the public tags is passed on to the site (ADR 0014): once
//   it is written here, a purge job asks the worker to purge the site's
//   cache too. Only then, so the site's next miss cannot fetch the old
//   data from here and keep it for an hour.

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
/** @type {ReturnType<typeof createPurgeQueue> | undefined} */
let sitePurges;
/** @type {Set<string>} */
const publicTags = new Set(Object.values(PUBLIC_TAGS));

/**
 * @param {string} tag
 * @returns {tag is import("@countrytopics/contracts").PublicTag}
 */
const isPublicTag = (tag) => publicTags.has(tag);
/** Build ids by the server folder they were read from. */
const buildIds = new Map();

function queuePrefix() {
  return process.env.QUEUE_PREFIX?.trim() || DEFAULT_QUEUE_PREFIX;
}

function prefix() {
  return `${queuePrefix()}:page-cache`;
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

/**
 * Asks the worker to purge the site's cache of the public tags among
 * `tags`. The jobs go to the queues' Valkey (REDIS_URL), not the cache's.
 * A failure is reported, not thrown: this cache is purged already, and the
 * site's pages refresh within the hour. While Valkey is away, queueing
 * gives up after the connect timeout rather than hold the request's
 * after() work.
 * @param {string[]} tags
 */
async function purgeSite(tags) {
  const purged = [...new Set(tags)].filter(isPublicTag);
  if (purged.length === 0) return;
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let timer;
  try {
    const url = process.env.REDIS_URL?.trim();
    if (!url) throw new Error("REDIS_URL must be set");
    sitePurges ??= createPurgeQueue({
      connection: createRedisConnection(url, "producer"),
      prefix: queuePrefix(),
    });
    await Promise.race([
      sitePurges.enqueue({ tags: purged }),
      new Promise((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error("Valkey did not answer in time")),
          REDIS_CONNECT_TIMEOUT_MS,
        );
      }),
    ]);
  } catch (error) {
    console.error(
      `Site purge not queued for ${purged.join(", ")}; its pages refresh within the hour:`,
      error instanceof Error ? error.message : error,
    );
  } finally {
    clearTimeout(timer);
  }
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
 * Whether an entry made at `lastModified` is gone (a tag expired since it
 * was made) or stale (a tag was marked stale since it was made), as
 * Next.js's own cache decides, except that a purge in the same millisecond
 * as the entry counts: the page may have been rendered before the purge,
 * and rendering it again costs less than keeping old content.
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
      state.expired >= lastModified
    ) {
      return "expired";
    }
    if (typeof state.stale === "number" && state.stale >= lastModified) {
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
   * Marks tags purged for every API process and build. Without durations
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
      // revalidation, other API processes keep the old entries.
      console.error(
        `Page cache purge failed for ${list.join(", ")}:`,
        error instanceof Error ? error.message : error,
      );
      throw error;
    }
    await purgeSite(list);
  }

  resetRequestCache() {}
}
