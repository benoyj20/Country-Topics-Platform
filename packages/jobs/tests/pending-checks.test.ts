import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  type PendingChecks,
  requeuePendingChecks,
} from "../src/pending-checks.ts";
import {
  type ReferenceCheckJob,
  referenceJobId,
} from "../src/reference-jobs.ts";
import type { VideoCheckJob } from "../src/video-jobs.ts";

// Synthetic record ids; 10.5555 is Crossref's test prefix.
const reference: ReferenceCheckJob = {
  referenceId: "01920000-0000-7000-8000-000000000003",
  requestedAt: "2026-10-16T12:00:00.000Z",
  doi: "10.5555/synthetic-2",
  isbn: null,
  url: null,
};
const video: VideoCheckJob = {
  videoId: "01920000-0000-7000-8000-000000000004",
  youtubeId: "TESTvideo02",
  requestedAt: "2026-10-16T12:00:00.000Z",
};

describe("referenceJobId", () => {
  it("gives each check request its own id, without colons", () => {
    const id = referenceJobId(reference);
    assert.equal(
      id,
      `reference-${reference.referenceId}-${Date.parse(reference.requestedAt)}`,
    );
    assert.ok(!id.includes(":"));
  });
});

describe("requeuePendingChecks", () => {
  it("queues every pending check, and carries on past one that fails", async () => {
    const pending: PendingChecks = {
      references: [reference, { ...reference, referenceId: "bad" }],
      videos: [video],
    };
    let limit = 0;
    const queuedReferences: ReferenceCheckJob[] = [];
    const queuedVideos: VideoCheckJob[] = [];
    const errors: string[] = [];
    const result = await requeuePendingChecks(
      {
        pendingChecks: async (max) => {
          limit = max;
          return pending;
        },
      },
      {
        references: {
          enqueue: async (job) => {
            if (job.referenceId === "bad") throw new Error("invalid job");
            queuedReferences.push(job);
          },
        },
        videos: { enqueue: async (job) => void queuedVideos.push(job) },
      },
      (message) => errors.push(message),
    );
    assert.deepEqual(result, { references: 1, videos: 1 });
    assert.deepEqual(queuedReferences, [reference]);
    assert.deepEqual(queuedVideos, [video]);
    assert.equal(errors.length, 1);
    assert.match(errors[0] ?? "", /pending reference check: invalid job/);
    assert.ok(limit > 0);
  });
});
