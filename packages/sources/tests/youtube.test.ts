import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  type Fetch,
  type SourceClient,
  SourceUnavailableError,
} from "../src/http.ts";
import { createYouTube, isoDurationSeconds } from "../src/youtube.ts";

// Synthetic responses shaped like YouTube's oEmbed endpoint and the Data
// API's videos.list; the id and titles are made up.
const ID = "TESTvideo01";
const OEMBED = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${ID}`)}`;
const DATA_API = `https://www.googleapis.com/youtube/v3/videos?part=contentDetails,status&id=${ID}`;
const KEY = "test-youtube-key";

type Answer = { status?: number; body?: unknown } | "timeout";

function fakeFetch(routes: Record<string, Answer>) {
  const calls: { url: string; headers: Headers }[] = [];
  const fetch: Fetch = async (input, init) => {
    const url = String(input);
    calls.push({ url, headers: new Headers(init?.headers) });
    const answer = routes[url];
    if (answer === "timeout") {
      throw new DOMException("The operation timed out.", "TimeoutError");
    }
    if (!answer) return new Response("not found", { status: 404 });
    return new Response(JSON.stringify(answer.body ?? {}), {
      status: answer.status ?? 200,
    });
  };
  return { fetch, calls };
}

const client = (fetch: Fetch): SourceClient => ({
  fetch,
  userAgent: "CountryTopicsPlatform/0.1 (test)",
  timeoutMs: 1_000,
});

const found = {
  body: { title: "A synthetic clip", author_name: "Test Channel" },
};

function dataApiItem({
  duration = "PT1M35S",
  embeddable = true,
  privacyStatus = "public",
  ytRating,
}: {
  duration?: string;
  embeddable?: boolean;
  privacyStatus?: string;
  ytRating?: string;
} = {}) {
  return {
    body: {
      items: [
        {
          contentDetails: {
            duration,
            ...(ytRating ? { contentRating: { ytRating } } : {}),
          },
          status: { embeddable, privacyStatus },
        },
      ],
    },
  };
}

describe("isoDurationSeconds", () => {
  it("reads durations and treats live streams as unknown", () => {
    assert.equal(isoDurationSeconds("PT1M35S"), 95);
    assert.equal(isoDurationSeconds("PT2H"), 7200);
    assert.equal(isoDurationSeconds("P1DT1S"), 86_401);
    assert.equal(isoDurationSeconds("P0D"), null);
    assert.equal(isoDurationSeconds("nonsense"), null);
  });
});

describe("lookupVideo without a key", () => {
  it("finds a playable video through oEmbed, length unknown", async () => {
    const { fetch, calls } = fakeFetch({ [OEMBED]: found });
    const result = await createYouTube(client(fetch)).lookupVideo(ID);
    assert.deepEqual(result, {
      status: "playable",
      title: "A synthetic clip",
      channel: "Test Channel",
      duration_s: null,
      message:
        "Checked with oEmbed. Without a YouTube Data API key, the video's length and age restriction are unknown.",
    });
    assert.deepEqual(
      calls.map((call) => call.url),
      [OEMBED],
    );
  });

  it("tells removed videos from ones that cannot be embedded", async () => {
    for (const status of [400, 404]) {
      const { fetch } = fakeFetch({ [OEMBED]: { status } });
      const result = await createYouTube(client(fetch)).lookupVideo(ID);
      assert.equal(result.status, "unavailable", String(status));
    }
    for (const status of [401, 403]) {
      const { fetch } = fakeFetch({ [OEMBED]: { status } });
      const result = await createYouTube(client(fetch)).lookupVideo(ID);
      assert.equal(result.status, "not_embeddable", String(status));
      assert.match(result.message, /or it is private/);
    }
  });

  it("throws, to be retried, when YouTube does not answer", async () => {
    for (const answer of ["timeout", { status: 503 }] as const) {
      const { fetch } = fakeFetch({ [OEMBED]: answer });
      await assert.rejects(
        createYouTube(client(fetch)).lookupVideo(ID),
        SourceUnavailableError,
      );
    }
  });

  it("refuses anything but a video id", async () => {
    const { fetch, calls } = fakeFetch({});
    await assert.rejects(
      createYouTube(client(fetch)).lookupVideo("../../oembed"),
      /Not a YouTube video id/,
    );
    assert.equal(calls.length, 0);
  });
});

describe("lookupVideo with a Data API key", () => {
  it("adds the length, sending the key in a header only", async () => {
    const { fetch, calls } = fakeFetch({
      [OEMBED]: found,
      [DATA_API]: dataApiItem(),
    });
    const result = await createYouTube(client(fetch), {
      dataApiKey: KEY,
    }).lookupVideo(ID);
    assert.deepEqual(result, {
      status: "playable",
      title: "A synthetic clip",
      channel: "Test Channel",
      duration_s: 95,
      message: "Checked with oEmbed and the YouTube Data API.",
    });
    const dataCall = calls.find((call) => call.url === DATA_API);
    assert.equal(dataCall?.headers.get("X-goog-api-key"), KEY);
    assert.ok(calls.every((call) => !call.url.includes(KEY)));
  });

  it("finds videos that cannot be embedded, age-restricted, or private", async () => {
    const cases = [
      [dataApiItem({ embeddable: false }), "not_embeddable", /uploader/],
      [
        dataApiItem({ ytRating: "ytAgeRestricted" }),
        "not_embeddable",
        /age-restricted/,
      ],
      [dataApiItem({ privacyStatus: "private" }), "unavailable", /private/],
      [{ body: { items: [] } }, "unavailable", /removed or is private/],
    ] as const;
    for (const [answer, status, message] of cases) {
      const { fetch } = fakeFetch({ [OEMBED]: found, [DATA_API]: answer });
      const result = await createYouTube(client(fetch), {
        dataApiKey: KEY,
      }).lookupVideo(ID);
      assert.equal(result.status, status);
      assert.match(result.message, message);
    }
  });

  it("settles what oEmbed's 401 means", async () => {
    const { fetch } = fakeFetch({
      [OEMBED]: { status: 401 },
      [DATA_API]: dataApiItem({ embeddable: false }),
    });
    const result = await createYouTube(client(fetch), {
      dataApiKey: KEY,
    }).lookupVideo(ID);
    assert.equal(result.status, "not_embeddable");
    assert.match(result.message, /uploader does not allow/);
  });

  it("keeps oEmbed's answer when the Data API fails, and reports it", async () => {
    for (const answer of [
      { status: 403 },
      { status: 503 },
      "timeout",
    ] as const) {
      const errors: string[] = [];
      const { fetch } = fakeFetch({ [OEMBED]: found, [DATA_API]: answer });
      const result = await createYouTube(client(fetch), {
        dataApiKey: KEY,
        onDataApiError: (message) => errors.push(message),
      }).lookupVideo(ID);
      assert.equal(result.status, "playable");
      assert.equal(result.duration_s, null);
      assert.match(result.message, /Data API did not answer/);
      assert.equal(errors.length, 1);
      assert.ok(!errors[0]?.includes(KEY));
    }
  });
});
