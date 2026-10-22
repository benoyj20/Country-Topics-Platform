import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  THUMBNAIL_MAX_BYTES,
  thumbnailResponse,
  thumbnailSource,
} from "../src/thumbnails.ts";
import { visitorAddress } from "../src/visitor-address.ts";

type Sent = { url: string; init: RequestInit };

/** A stand-in for fetch that records what was sent and answers `answer`. */
function youtube(answer: () => Response) {
  const sent: Sent[] = [];
  const send = (async (url: URL | string, init: RequestInit = {}) => {
    sent.push({ url: String(url), init });
    return answer();
  }) as typeof fetch;
  return { sent, send };
}

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);

describe("the thumbnail route", () => {
  it("fetches only YouTube's image for the video, with nothing of the visitor's", async () => {
    const { sent, send } = youtube(
      () => new Response(JPEG, { headers: { "content-type": "image/jpeg" } }),
    );
    const response = await thumbnailResponse("dQw4w9WgXcQ", send);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "image/jpeg");
    assert.equal(
      response.headers.get("cache-control"),
      "public, max-age=86400",
    );
    assert.deepEqual(new Uint8Array(await response.arrayBuffer()), JPEG);
    const [{ url, init }] = sent as [Sent];
    assert.equal(url, "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg");
    assert.equal(url, thumbnailSource("dQw4w9WgXcQ"));
    // No cookie, no visitor headers, and no redirect to anywhere else.
    assert.deepEqual([...new Headers(init.headers).keys()], ["accept"]);
    assert.equal(init.redirect, "manual");
    assert.equal(init.credentials, undefined);
  });

  it("refuses anything but a video ID, without fetching", async () => {
    const { sent, send } = youtube(() => new Response(JPEG));
    for (const id of [
      "short",
      "dQw4w9WgXcQx",
      "../../evil",
      "dQw4w9WgXc%",
      "dQw4w9WgX/Q",
      "",
    ]) {
      const response = await thumbnailResponse(id, send);
      assert.equal(response.status, 404, id);
    }
    assert.equal(sent.length, 0);
  });

  it("says when YouTube has no thumbnail, or answers with something else, or a redirect", async () => {
    const missing = await thumbnailResponse(
      "dQw4w9WgXcQ",
      youtube(() => new Response("", { status: 404 })).send,
    );
    assert.equal(missing.status, 404);
    assert.equal(missing.headers.get("cache-control"), "public, max-age=3600");
    const page = await thumbnailResponse(
      "dQw4w9WgXcQ",
      youtube(
        () =>
          new Response("<html>", { headers: { "content-type": "text/html" } }),
      ).send,
    );
    assert.equal(page.status, 502);
    const moved = await thumbnailResponse(
      "dQw4w9WgXcQ",
      youtube(
        () =>
          new Response(null, {
            status: 302,
            headers: { location: "https://evil.example/x.jpg" },
          }),
      ).send,
    );
    assert.equal(moved.status, 502);
    const down = await thumbnailResponse("dQw4w9WgXcQ", (async () => {
      throw new TypeError("fetch failed");
    }) as typeof fetch);
    assert.equal(down.status, 502);
  });

  it("refuses an image larger than a thumbnail, whether or not it says so", async () => {
    const big = new Uint8Array(THUMBNAIL_MAX_BYTES + 1);
    const declared = await thumbnailResponse(
      "dQw4w9WgXcQ",
      youtube(
        () =>
          new Response(big, {
            headers: {
              "content-type": "image/jpeg",
              "content-length": String(big.byteLength),
            },
          }),
      ).send,
    );
    assert.equal(declared.status, 502);
    const streamed = await thumbnailResponse(
      "dQw4w9WgXcQ",
      youtube(
        () =>
          new Response(
            new ReadableStream({
              start(controller) {
                controller.enqueue(big);
                controller.close();
              },
            }),
            { headers: { "content-type": "image/jpeg" } },
          ),
      ).send,
    );
    assert.equal(streamed.status, 502);
  });
});

describe("the visitor's address", () => {
  it("is Cloudflare's header when deployed, and 127.0.0.1 for everyone locally", () => {
    const headers = new Headers({ "cf-connecting-ip": "203.0.113.7" });
    assert.equal(
      visitorAddress(headers, { environment: "production" }),
      "203.0.113.7",
    );
    assert.equal(
      visitorAddress(headers, { environment: "local" }),
      "127.0.0.1",
    );
    assert.equal(
      visitorAddress(new Headers(), { environment: "staging" }),
      null,
    );
    assert.equal(
      visitorAddress(new Headers({ "cf-connecting-ip": "not an address" }), {
        environment: "production",
      }),
      null,
    );
  });
});
