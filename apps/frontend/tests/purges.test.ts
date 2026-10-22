import { PURGE_HEADERS, signPurge } from "@countrytopics/forwarding";
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { purgeResponse } from "../src/purges.ts";

const KEY = "test-purge-key-0123456789abcdef0123";
const NOW = Date.UTC(2026, 9, 21, 12, 0, 0);
const BODY = JSON.stringify({ tags: ["public:topics", "public:media"] });

async function purge(body: string, headers: Record<string, string>, now = NOW) {
  const purged: string[] = [];
  const response = await purgeResponse(
    new Request("http://localhost:3000/api/revalidate", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body,
    }),
    KEY,
    (tag) => purged.push(tag),
    now,
  );
  return { response, purged };
}

describe("the site's purge", () => {
  it("purges the tags of a purge the worker signed", async () => {
    const { response, purged } = await purge(
      BODY,
      await signPurge(KEY, BODY, NOW),
    );
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(await response.json(), {
      purged: ["public:topics", "public:media"],
    });
    assert.deepEqual(purged, ["public:topics", "public:media"]);
  });

  it("refuses an unsigned, forged, or old purge, and purges nothing", async () => {
    const old = NOW - 6 * 60 * 1000;
    for (const headers of [
      {},
      await signPurge(`${KEY}-other`, BODY, NOW),
      await signPurge(KEY, JSON.stringify({ tags: ["public:media"] }), NOW),
      await signPurge(KEY, BODY, old),
      { [PURGE_HEADERS.timestamp]: "1", [PURGE_HEADERS.signature]: "x" },
    ]) {
      const { response, purged } = await purge(BODY, headers);
      assert.equal(response.status, 403, JSON.stringify(headers));
      assert.deepEqual(await response.json(), {
        error: "The purge is not signed by the worker.",
        problems: [],
      });
      assert.deepEqual(purged, []);
    }
  });

  it("refuses a signed purge that names no known tag", async () => {
    for (const body of [
      "not json",
      JSON.stringify({ tags: ["_N_T_/admin"] }),
      JSON.stringify({ tags: [] }),
      JSON.stringify({ tags: ["public:topics"], paths: ["/"] }),
    ]) {
      const { response, purged } = await purge(
        body,
        await signPurge(KEY, body, NOW),
      );
      assert.equal(response.status, 400, body);
      assert.deepEqual(purged, []);
    }
  });

  it("reads no more than a purge can need", async () => {
    const body = JSON.stringify({
      tags: ["public:topics"],
      pad: "x".repeat(2048),
    });
    const { response, purged } = await purge(
      body,
      await signPurge(KEY, body, NOW),
    );
    assert.equal(response.status, 413);
    assert.deepEqual(purged, []);
  });
});
