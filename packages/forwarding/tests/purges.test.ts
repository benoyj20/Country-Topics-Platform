import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  checkPurge,
  FORWARDING_HEADERS,
  MAX_CLOCK_SKEW_S,
  PURGE_HEADERS,
  signForwardedRequest,
  signPurge,
} from "../src/index.ts";

const KEY = "test-purge-key-0123456789abcdef0123";
const NOW = Date.UTC(2026, 9, 21, 12, 0, 0);
const BODY = JSON.stringify({ tags: ["public:topics"] });

async function signed(
  overrides: Partial<{ key: string; body: string; now: number }> = {},
) {
  return new Headers(
    await signPurge(
      overrides.key ?? KEY,
      overrides.body ?? BODY,
      overrides.now ?? NOW,
    ),
  );
}

describe("purge signatures", () => {
  it("are accepted for the body they sign", async () => {
    assert.deepEqual(await checkPurge(KEY, BODY, await signed(), NOW), {
      ok: true,
    });
  });

  it("are refused with another key, or for another body", async () => {
    const forged = { ok: false, reason: "forged" };
    assert.deepEqual(
      await checkPurge(KEY, BODY, await signed({ key: `${KEY}-other` }), NOW),
      forged,
    );
    assert.deepEqual(
      await checkPurge(
        KEY,
        JSON.stringify({ tags: ["public:media"] }),
        await signed(),
        NOW,
      ),
      forged,
    );
  });

  it("are refused once older or newer than the allowed skew", async () => {
    const limit = MAX_CLOCK_SKEW_S * 1000;
    assert.equal(
      (await checkPurge(KEY, BODY, await signed(), NOW + limit - 1000)).ok,
      true,
    );
    for (const now of [NOW + limit + 1000, NOW - limit - 1000]) {
      assert.deepEqual(await checkPurge(KEY, BODY, await signed(), now), {
        ok: false,
        reason: "expired",
      });
    }
  });

  it("tell an unsigned purge from a malformed one", async () => {
    assert.deepEqual(await checkPurge(KEY, BODY, new Headers(), NOW), {
      ok: false,
      reason: "unsigned",
    });
    const headers = await signed();
    for (const [name, value] of [
      [PURGE_HEADERS.timestamp, "soon"],
      [PURGE_HEADERS.signature, "short"],
    ] as const) {
      const broken = new Headers(headers);
      broken.set(name, value);
      assert.deepEqual(await checkPurge(KEY, BODY, broken, NOW), {
        ok: false,
        reason: "malformed",
      });
    }
    const partial = new Headers(headers);
    partial.delete(PURGE_HEADERS.signature);
    assert.deepEqual(await checkPurge(KEY, BODY, partial, NOW), {
      ok: false,
      reason: "malformed",
    });
  });

  it("are never a forwarded request's signature, even with the same key", async () => {
    const forwarded = new Headers(
      await signForwardedRequest(
        KEY,
        { method: "POST", pathAndQuery: "/api/revalidate" },
        "127.0.0.1",
        NOW,
      ),
    );
    const headers = new Headers({
      [PURGE_HEADERS.timestamp]:
        forwarded.get(FORWARDING_HEADERS.timestamp) ?? "",
      [PURGE_HEADERS.signature]:
        forwarded.get(FORWARDING_HEADERS.signature) ?? "",
    });
    assert.deepEqual(await checkPurge(KEY, BODY, headers, NOW), {
      ok: false,
      reason: "forged",
    });
  });
});
