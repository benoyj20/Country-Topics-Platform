import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  checkForwardedRequest,
  FORWARDING_HEADERS,
  MAX_CLOCK_SKEW_S,
  signedPathAndQuery,
  signForwardedRequest,
} from "../src/index.ts";

const KEY = "test-forwarding-key-0123456789abcdef";
const NOW = Date.UTC(2026, 9, 21, 12, 0, 0);
const REQUEST = {
  method: "POST",
  pathAndQuery: "/api/v1/topics/x/comments?a=1",
};

async function signed(
  overrides: Partial<{ key: string; address: string; now: number }> = {},
) {
  return new Headers(
    await signForwardedRequest(
      overrides.key ?? KEY,
      REQUEST,
      overrides.address ?? "203.0.113.7",
      overrides.now ?? NOW,
    ),
  );
}

describe("forwarded request signatures", () => {
  it("are accepted for the request they sign, with the visitor's address", async () => {
    assert.deepEqual(
      await checkForwardedRequest(KEY, REQUEST, await signed(), NOW),
      {
        ok: true,
        clientAddress: "203.0.113.7",
      },
    );
    const ipv6 = await signed({ address: "2001:db8::1" });
    assert.equal(
      (await checkForwardedRequest(KEY, REQUEST, ipv6, NOW)).ok,
      true,
    );
    // Method names are compared in capitals, as HTTP sends them.
    assert.equal(
      (
        await checkForwardedRequest(
          KEY,
          { ...REQUEST, method: "post" },
          await signed(),
          NOW,
        )
      ).ok,
      true,
    );
  });

  it("are refused for any other method, path, query, address, or key", async () => {
    const headers = await signed();
    for (const request of [
      { ...REQUEST, method: "DELETE" },
      { ...REQUEST, pathAndQuery: "/api/v1/account" },
      { ...REQUEST, pathAndQuery: "/api/v1/topics/x/comments?a=2" },
    ]) {
      assert.deepEqual(
        await checkForwardedRequest(KEY, request, headers, NOW),
        {
          ok: false,
          reason: "forged",
        },
      );
    }
    const moved = new Headers(headers);
    moved.set(FORWARDING_HEADERS.clientAddress, "198.51.100.9");
    assert.equal(
      (await checkForwardedRequest(KEY, REQUEST, moved, NOW)).ok,
      false,
    );
    assert.equal(
      (
        await checkForwardedRequest(
          KEY,
          REQUEST,
          await signed({ key: "another-key-0123456789abcdef-xyz" }),
          NOW,
        )
      ).ok,
      false,
    );
  });

  it("expire beyond the allowed clock difference, either way", async () => {
    const limit = MAX_CLOCK_SKEW_S * 1000;
    assert.equal(
      (await checkForwardedRequest(KEY, REQUEST, await signed(), NOW + limit))
        .ok,
      true,
    );
    assert.equal(
      (await checkForwardedRequest(KEY, REQUEST, await signed(), NOW - limit))
        .ok,
      true,
    );
    for (const now of [NOW + limit + 1000, NOW - limit - 1000]) {
      assert.deepEqual(
        await checkForwardedRequest(KEY, REQUEST, await signed(), now),
        {
          ok: false,
          reason: "expired",
        },
      );
    }
  });

  it("tell an unsigned request from a malformed one", async () => {
    assert.deepEqual(
      await checkForwardedRequest(KEY, REQUEST, new Headers(), NOW),
      {
        ok: false,
        reason: "unsigned",
      },
    );
    const headers = await signed();
    for (const [name, value] of [
      [FORWARDING_HEADERS.timestamp, "soon"],
      [FORWARDING_HEADERS.clientAddress, "203.0.113.7 extra"],
      [FORWARDING_HEADERS.clientAddress, "example.org"],
      [FORWARDING_HEADERS.signature, "short"],
    ] as const) {
      const broken = new Headers(headers);
      broken.set(name, value);
      assert.deepEqual(await checkForwardedRequest(KEY, REQUEST, broken, NOW), {
        ok: false,
        reason: "malformed",
      });
    }
    const partial = new Headers(headers);
    partial.delete(FORWARDING_HEADERS.signature);
    assert.equal(
      (await checkForwardedRequest(KEY, REQUEST, partial, NOW)).ok,
      false,
    );
  });

  it("are never made for something that is not an IP address", async () => {
    await assert.rejects(signForwardedRequest(KEY, REQUEST, "unknown", NOW));
  });
  it("cover the path the backend sees: _rsc left out, the query re-encoded as Next.js does", () => {
    const path = (url: string) => signedPathAndQuery(new URL(url));
    assert.equal(path("http://b/topics/x?_rsc=abc"), "/topics/x");
    assert.equal(
      path("http://b/topics?country=kenya&_rsc=abc"),
      "/topics?country=kenya",
    );
    assert.equal(
      path("http://b/api/topics?where[slug][equals]=a b&x='"),
      "/api/topics?where%5Bslug%5D%5Bequals%5D=a+b&x=%27",
    );
    assert.equal(path("http://b/api/v1/topics?"), "/api/v1/topics");
  });
});
