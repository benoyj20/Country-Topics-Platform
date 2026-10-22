import { createRedisConnection, PURGE_QUEUE_NAME } from "@countrytopics/jobs";
import { Queue } from "bullmq";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import SharedCacheHandler, {
  entryState,
  entryTags,
} from "../../cache-handler.mjs";

// The shared page cache (ADR 0013) against the real Valkey, with two
// handlers standing in for two API containers: what one stores, the other
// reads, and a purge through either reaches both. Keys use the tests'
// queue prefix, never the site's, so no worker sends the tests' purges on.

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

const queueConnection = createRedisConnection(
  process.env.REDIS_URL ?? "redis://localhost:6379",
  "worker",
);
const sitePurges = new Queue(PURGE_QUEUE_NAME, {
  connection: queueConnection,
  prefix: process.env.QUEUE_PREFIX,
});

/** The tags of the site purges queued since the last call. */
async function queuedSitePurges(): Promise<string[][]> {
  const jobs = await sitePurges.getJobs(["waiting", "delayed"]);
  await sitePurges.obliterate({ force: true });
  // Jobs queued in the same millisecond are told apart by their ids,
  // which the queue counts up.
  return jobs
    .sort((a, b) => a.timestamp - b.timestamp || Number(a.id) - Number(b.id))
    .map((job) => job.data.tags);
}

beforeAll(async () => {
  await clearPageCache();
  await sitePurges.obliterate({ force: true });
});
afterAll(async () => {
  await clearPageCache();
  await sitePurges.obliterate({ force: true });
  await sitePurges.close();
  await queueConnection.quit();
});

describe("the shared page cache", () => {
  it("serves a page one API process stored to another, Buffers and Maps intact", async () => {
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
    // Rendered again after the purge, it is served again. (A purge in the
    // same millisecond as a page counts against it, so wait past it.)
    await new Promise((resolve) => setTimeout(resolve, 5));
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

  it("passes a purge of public tags on to the site once it is written", async () => {
    await queuedSitePurges();
    await webA.revalidateTag(
      ["public:topics", "_N_T_/topics/x", "public:topics"],
      { expire: 0 },
    );
    await webB.revalidateTag("public:media");
    await webA.revalidateTag("_N_T_/admin");
    expect(await queuedSitePurges()).toEqual([
      ["public:topics"],
      ["public:media"],
    ]);
  });

  it("forgets an entry stored as nothing", async () => {
    await webA.set("gone", pageValue, {});
    await webA.set("gone", null, {});
    expect(await webB.get("gone", {})).toBeNull();
  });
});

describe("builds", () => {
  /** Next.js's options for a build whose BUILD_ID is `id`. */
  function buildOptions(id: string) {
    const dist = mkdtempSync(path.join(tmpdir(), "next-build-"));
    writeFileSync(path.join(dist, "BUILD_ID"), id);
    mkdirSync(path.join(dist, "server"));
    return { serverDistDir: path.join(dist, "server") };
  }

  it("keep their own pages, which point at their own scripts, but share purges", async () => {
    const oldBuild = new SharedCacheHandler(buildOptions("TEST-build-1"));
    const newBuild = new SharedCacheHandler(buildOptions("TEST-build-2"));
    await oldBuild.set("/route-cache/APP_PAGE/x/$/builds", pageValue, {});
    expect(
      await newBuild.get("/route-cache/APP_PAGE/x/$/builds", {}),
    ).toBeNull();
    expect(
      await oldBuild.get("/route-cache/APP_PAGE/x/$/builds", {}),
    ).not.toBeNull();
    await newBuild.revalidateTag("public:topics", { expire: 0 });
    expect(
      await oldBuild.get("/route-cache/APP_PAGE/x/$/builds", {}),
    ).toBeNull();
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

  it("follow Next.js: expired since the entry was made, or only stale", () => {
    const made = 1_000;
    const now = 5_000;
    expect(entryState([null, { expired: 2_000 }], made, now)).toBe("expired");
    // A purge in the same millisecond counts against the entry.
    expect(entryState([{ expired: made }], made, now)).toBe("expired");
    // A purge before the entry was made, or one not yet due, does not count.
    expect(entryState([{ expired: 500 }], made, now)).toBe("fresh");
    expect(entryState([{ stale: 2_000, expired: 9_000 }], made, now)).toBe(
      "stale",
    );
  });
});
