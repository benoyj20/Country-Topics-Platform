import { checkPurge } from "@countrytopics/forwarding";
import { UnrecoverableError } from "bullmq";
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { type PurgeJob, purgeJobSchema, sendPurge } from "../src/purge-jobs.ts";

const KEY = "test-purge-key-0123456789abcdef0123";
const NOW = Date.UTC(2026, 9, 21, 12, 0, 0);
const JOB: PurgeJob = { tags: ["public:topics", "public:media"] };

/** A stand-in site that answers each purge with `status` and records it. */
function site(status = 200) {
  const sent: Request[] = [];
  const fetch = async (input: string | URL | Request, init?: RequestInit) => {
    sent.push(new Request(input, init));
    return Response.json(status === 200 ? { purged: JOB.tags } : {}, {
      status,
    });
  };
  return {
    sent,
    purger: { siteUrl: "http://localhost:3000", purgeKey: KEY, fetch },
  };
}

describe("purgeJobSchema", () => {
  it("takes the public tags only", () => {
    assert.deepEqual(purgeJobSchema.parse(JOB), JOB);
    assert.equal(
      purgeJobSchema.safeParse({ tags: ["public:unknown"] }).success,
      false,
    );
  });
});

describe("sendPurge", () => {
  it("posts the tags to the site's /api/revalidate, signed for its body", async () => {
    const { sent, purger } = site();
    assert.deepEqual(await sendPurge(purger, JOB, NOW), { purged: JOB.tags });
    assert.equal(sent.length, 1);
    const [request] = sent;
    assert.ok(request);
    assert.equal(request.method, "POST");
    assert.equal(request.url, "http://localhost:3000/api/revalidate");
    assert.equal(request.redirect, "manual");
    const body = await request.text();
    assert.deepEqual(JSON.parse(body), JOB);
    assert.deepEqual(await checkPurge(KEY, body, request.headers, NOW), {
      ok: true,
    });
  });

  it("throws for a retry when the site fails, is busy, or refuses the signature", async () => {
    for (const status of [403, 408, 429, 500, 502, 503]) {
      const { purger } = site(status);
      await assert.rejects(sendPurge(purger, JOB, NOW), (error: Error) => {
        assert.ok(!(error instanceof UnrecoverableError), String(status));
        assert.match(error.message, new RegExp(String(status)));
        return true;
      });
    }
  });

  it("gives up at once on answers no retry changes", async () => {
    for (const status of [301, 400, 404, 405, 413]) {
      const { purger } = site(status);
      await assert.rejects(
        sendPurge(purger, JOB, NOW),
        UnrecoverableError,
        String(status),
      );
    }
  });

  it("never sends a tag the site does not know", async () => {
    const { sent, purger } = site();
    await assert.rejects(
      sendPurge(purger, { tags: ["_N_T_/admin"] } as never, NOW),
    );
    assert.equal(sent.length, 0);
  });
});
