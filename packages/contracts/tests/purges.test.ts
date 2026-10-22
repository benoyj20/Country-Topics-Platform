import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  PUBLIC_TAGS,
  PURGE_BODY_MAX_BYTES,
  PurgeRequest,
} from "../src/index.ts";

describe("PurgeRequest", () => {
  it("takes public tags", () => {
    assert.deepEqual(
      PurgeRequest.parse({ tags: [PUBLIC_TAGS.topics, PUBLIC_TAGS.media] }),
      { tags: ["public:topics", "public:media"] },
    );
  });

  it("refuses other tags, repeats, none, and anything else", () => {
    for (const body of [
      { tags: [] },
      { tags: ["public:unknown"] },
      { tags: ["_N_T_/topics/x"] },
      { tags: [PUBLIC_TAGS.topics, PUBLIC_TAGS.topics] },
      { tags: [PUBLIC_TAGS.topics], paths: ["/"] },
      { tags: PUBLIC_TAGS.topics },
      null,
    ]) {
      assert.equal(PurgeRequest.safeParse(body).success, false, String(body));
    }
  });

  it("fits every tag within the body limit", () => {
    const all = JSON.stringify({ tags: Object.values(PUBLIC_TAGS) });
    assert.ok(new TextEncoder().encode(all).length < PURGE_BODY_MAX_BYTES / 2);
  });
});
