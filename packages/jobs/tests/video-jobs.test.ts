import {
  SourceUnavailableError,
  type VideoLookup,
  type YouTube,
} from "@countrytopics/sources";
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  processVideoCheck,
  type VideoCheckJob,
  type VideoCheckResult,
  videoCheckJobSchema,
  videoJobId,
  type VideoState,
} from "../src/video-jobs.ts";

// A synthetic record id and a made-up, well-formed YouTube id.
const job: VideoCheckJob = {
  videoId: "01920000-0000-7000-8000-000000000002",
  youtubeId: "TESTvideo01",
  requestedAt: "2026-10-16T12:00:00.000Z",
};

const playable: VideoLookup = {
  status: "playable",
  title: "A synthetic clip",
  channel: "Test Channel",
  duration_s: 95,
  message: "Checked with oEmbed and the YouTube Data API.",
};

function fakeStore(state: VideoState) {
  const saved: VideoCheckResult[] = [];
  return {
    saved,
    store: {
      videoState: async () => state,
      saveVideoCheck: async (_job: VideoCheckJob, result: VideoCheckResult) => {
        saved.push(result);
        return true;
      },
    },
  };
}

function youtube(lookup: () => Promise<VideoLookup>) {
  let calls = 0;
  const client: YouTube = {
    lookupVideo: async () => {
      calls += 1;
      return lookup();
    },
  };
  return { client, calls: () => calls };
}

const unavailable = async (): Promise<never> => {
  throw new SourceUnavailableError("YouTube", "did not answer in time");
};

describe("videoCheckJobSchema and videoJobId", () => {
  it("accepts a record id and a YouTube id only, one job per request", () => {
    assert.equal(videoCheckJobSchema.safeParse(job).success, true);
    for (const bad of [
      { ...job, videoId: "not-a-uuid" },
      { ...job, youtubeId: "../oembed?x" },
      { ...job, youtubeId: "short" },
      { ...job, requestedAt: "yesterday" },
    ]) {
      assert.equal(videoCheckJobSchema.safeParse(bad).success, false);
    }
    const id = videoJobId(job);
    assert.equal(id, `video-${job.videoId}-${Date.parse(job.requestedAt)}`);
    assert.ok(!id.includes(":"), "BullMQ refuses ids with colons");
    assert.notEqual(
      videoJobId({ ...job, requestedAt: "2026-10-16T12:00:00.001Z" }),
      id,
    );
  });
});

describe("processVideoCheck", () => {
  it("stores what YouTube says", async () => {
    const { store, saved } = fakeStore("pending");
    const result = await processVideoCheck(
      job,
      { youtube: youtube(async () => playable).client, store },
      { isFinal: false },
    );
    assert.equal(result, "saved");
    assert.deepEqual(saved, [playable]);
  });

  it("stores a removed video as unavailable at once", async () => {
    const { store, saved } = fakeStore("pending");
    const gone: VideoLookup = {
      status: "unavailable",
      title: null,
      channel: null,
      duration_s: null,
      message: "Removed.",
    };
    await processVideoCheck(
      job,
      { youtube: youtube(async () => gone).client, store },
      { isFinal: false },
    );
    assert.deepEqual(saved, [gone]);
  });

  it("retries while YouTube is down, and records it on the last attempt", async () => {
    const { store, saved } = fakeStore("pending");
    const deps = { youtube: youtube(unavailable).client, store };
    await assert.rejects(
      processVideoCheck(job, deps, { isFinal: false }),
      SourceUnavailableError,
    );
    assert.equal(saved.length, 0);
    assert.equal(
      await processVideoCheck(job, deps, { isFinal: true }),
      "saved",
    );
    assert.deepEqual(saved, [
      {
        status: "failed",
        title: null,
        channel: null,
        duration_s: null,
        message:
          "YouTube did not answer in time. Save a snippet of this video to try again.",
      },
    ]);
  });

  it("records an unexpected error as failed on the last attempt, and still fails", async () => {
    const { store, saved } = fakeStore("pending");
    const deps = {
      youtube: youtube(async () => {
        throw new TypeError("bug");
      }).client,
      store,
    };
    await assert.rejects(
      processVideoCheck(job, deps, { isFinal: true }),
      TypeError,
    );
    assert.equal(saved[0]?.status, "failed");
    assert.match(saved[0]?.message ?? "", /failed unexpectedly/);
  });

  it("waits for an uncommitted save and skips checked videos, without asking YouTube", async () => {
    const missing = fakeStore("missing");
    const asked = youtube(async () => playable);
    await assert.rejects(
      processVideoCheck(
        job,
        { youtube: asked.client, store: missing.store },
        { isFinal: false },
      ),
      /not saved yet/,
    );
    assert.equal(
      await processVideoCheck(
        job,
        { youtube: asked.client, store: missing.store },
        { isFinal: true },
      ),
      "superseded",
    );
    const checked = fakeStore("superseded");
    assert.equal(
      await processVideoCheck(
        job,
        { youtube: asked.client, store: checked.store },
        { isFinal: false },
      ),
      "superseded",
    );
    assert.equal(asked.calls(), 0);
    assert.equal(missing.saved.length + checked.saved.length, 0);
  });
});
