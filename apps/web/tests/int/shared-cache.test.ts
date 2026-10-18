import { createRedisConnection } from "@countrytopics/jobs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import SharedCacheHandler, {
  entryState,
  entryTags,
} from "../../cache-handler.mjs";

// The shared page cache (ADR 0013) against the real Valkey, with two
// handlers standing in for two web containers: what one stores, the other
// reads, and a purge through either reaches both. Keys use the tests'
// queue prefix, never the site's.

const pageValue = {
  kind: "APP_PAGE",
  html: "<p>TEST page</p>",
  rscData: Buffer.from("TEST rsc payload"),
  segmentData: new Map([["/_index", Buffer.from("TEST segment")]]),
  headers: { "x-next-cache-tags": "public:topics,_N_T_/topics/test" },
  status: 200,
};

const webA = new SharedCacheHandler();
const webB = new SharedCacheHandler();

async function clearPageCache(): Promise<void> {
  const redis = createRedisConnection(
    process.env.REDIS_URL ?? "redis://localhost:6379",
    "worker",
  );
  try {
    const prefix = `${process.env.QUEUE_PREFIX}:page-cache`;
    let cursor = "0";
    do {
      const [next, keys] = await redis.scan(cursor, "MATCH", `${prefix}:*`);
      cursor = next;
      if (keys.length > 0) await redis.del(...keys);
    } while (cursor !== "0");
  } finally {
    await redis.quit();
  }
}

beforeAll(clearPageCache);
afterAll(clearPageCache);

describe("the shared page cache", () => {
  it("serves a page one web process stored to another, Buffers and Maps intact", async () => {
    await webA.set("/route-cache/APP_PAGE/x/$/topics/test", pageValue, {});
    const read = await webB.get("/route-cache/APP_PAGE/x/$/topics/test", {});
    expect(read?.value).toEqual(pageValue);
    expect(Buffer.isBuffer((read?.value as typeof pageValue).rscData)).toBe(
      true,
    );
    expect(read?.lastModified).toBeGreaterThan(1);
  });

  it("drops a page everywhere once a tag it shows is purged", async () => {
    const key = "/route-cache/APP_PAGE/x/$/topics/purged";
    await webA.set(key, pageValue, {});
    await webB.set(
      "/route-cache/APP_PAGE/x/$/other",
      {
        ...pageValue,
        headers: { "x-next-cache-tags": "public:countries" },
      },
      {},
    );
    // Next.js purges with `expire: 0` (src/public-cache.ts).
    await webB.revalidateTag(["public:topics"], { expire: 0 });
    expect(await webA.get(key, {})).toBeNull();
    expect(
      await webA.get("/route-cache/APP_PAGE/x/$/other", {}),
    ).not.toBeNull();
    // Rendered again after the purge, it is served again.
    await webA.set(key, pageValue, {});
    expect(await webB.get(key, {})).not.toBeNull();
  });

  it("checks data entries against the tags they were stored with and those asked for", async () => {
    const data = { kind: "FETCH", data: { body: "TEST" }, revalidate: 3600 };
    await webA.set("fetch-key", data, { tags: ["public:individuals"] });
    expect((await webB.get("fetch-key", { tags: [] }))?.value).toEqual(data);
    await webA.revalidateTag("public:individuals");
    expect(await webB.get("fetch-key", { tags: [] })).toBeNull();
  });

  it("forgets an entry stored as nothing", async () => {
    await webA.set("gone", pageValue, {});
    await webA.set("gone", null, {});
    expect(await webB.get("gone", {})).toBeNull();
  });
});

describe("tag rules", () => {
  it("collect tags from the entry, the request, and a page's header", () => {
    expect(
      entryTags(
        { value: pageValue, lastModified: 1, tags: ["a"] },
        { tags: ["b"], softTags: ["a", "c"] },
      ),
    ).toEqual(["a", "b", "c", "public:topics", "_N_T_/topics/test"]);
  });

  it("follow Next.js: expired after the entry was made, or only stale", () => {
    const made = 1_000;
    const now = 5_000;
    expect(entryState([null, { expired: 2_000 }], made, now)).toBe("expired");
    // A purge before the entry was made, or one not yet due, does not count.
    expect(entryState([{ expired: 500 }], made, now)).toBe("fresh");
    expect(entryState([{ stale: 2_000, expired: 9_000 }], made, now)).toBe(
      "stale",
    );
  });
});
