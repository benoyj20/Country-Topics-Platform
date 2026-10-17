import type { LinkArchiveStatus } from "@countrytopics/domain";
import {
  ArchiveRefusedError,
  type Bibliography,
  type CaptureStatus,
  SourceUnavailableError,
  type WebArchive,
} from "@countrytopics/sources";
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  type LinkArchiveRecord,
  linkArchiveJobSchema,
  linkJobId,
  processLinkArchive,
} from "../src/link-jobs.ts";
import {
  processReferenceCheck,
  type ReferenceCheckers,
  type ReferenceCheckJob,
  type ReferenceCheckResult,
  referenceCheckJobSchema,
  type ReferenceState,
} from "../src/reference-jobs.ts";

// Synthetic identifiers: 10.5555 is Crossref's test prefix and example.org
// is a reserved documentation domain.
const job: ReferenceCheckJob = {
  referenceId: "01920000-0000-7000-8000-000000000001",
  requestedAt: "2026-10-16T12:00:00.000Z",
  doi: "10.5555/synthetic-1",
  isbn: null,
  url: "https://example.org/report",
};

function fakeStore(state: ReferenceState) {
  const saved: ReferenceCheckResult[] = [];
  return {
    saved,
    store: {
      referenceState: async () => state,
      saveReferenceCheck: async (
        _job: ReferenceCheckJob,
        result: ReferenceCheckResult,
      ) => {
        saved.push(result);
        return true;
      },
    },
  };
}

function checkers(
  overrides: Partial<Bibliography> = {},
  url = "resolved" as const,
): ReferenceCheckers {
  return {
    bibliography: {
      lookupDoi: async () => ({
        found: true,
        metadata: { source: "Crossref", authors: [] },
      }),
      lookupIsbn: async () => ({ found: false }),
      ...overrides,
    },
    checkUrl: async () => ({
      outcome: url,
      message: "The page answered (200).",
    }),
  };
}

const unavailable = async (): Promise<never> => {
  throw new SourceUnavailableError("Crossref", "did not answer in time");
};

describe("referenceCheckJobSchema", () => {
  it("accepts normalised identifiers only", () => {
    assert.equal(referenceCheckJobSchema.safeParse(job).success, true);
    for (const bad of [
      { ...job, referenceId: "1" },
      { ...job, requestedAt: "yesterday" },
      { ...job, isbn: "0-306-40615-2" },
      { ...job, url: "javascript:alert(1)" },
    ]) {
      assert.equal(referenceCheckJobSchema.safeParse(bad).success, false);
    }
  });
});

describe("processReferenceCheck", () => {
  it("stores resolved when every identifier resolves", async () => {
    const { store, saved } = fakeStore("pending");
    assert.equal(
      await processReferenceCheck(
        job,
        { checkers: checkers(), store },
        { isFinal: false },
      ),
      "saved",
    );
    assert.deepEqual(saved, [
      {
        status: "resolved",
        message: "DOI: Found in Crossref. Link: The page answered (200).",
      },
    ]);
  });

  it("stores not found for an unregistered DOI", async () => {
    const { store, saved } = fakeStore("pending");
    await processReferenceCheck(
      job,
      {
        checkers: checkers({ lookupDoi: async () => ({ found: false }) }),
        store,
      },
      { isFinal: false },
    );
    assert.equal(saved[0]?.status, "not_found");
    assert.match(saved[0]?.message ?? "", /No such DOI/);
  });

  it("retries when a service is down, and records it on the last attempt", async () => {
    const { store, saved } = fakeStore("pending");
    const deps = { checkers: checkers({ lookupDoi: unavailable }), store };
    await assert.rejects(
      processReferenceCheck(job, deps, { isFinal: false }),
      /retried/,
    );
    assert.deepEqual(saved, []);
    await processReferenceCheck(job, deps, { isFinal: true });
    assert.deepEqual(saved, [
      { status: "failed", message: "DOI: Crossref did not answer in time." },
    ]);
  });

  it("waits for an uncommitted save and skips superseded jobs, without calling services", async () => {
    let calls = 0;
    const counting = checkers({
      lookupDoi: async () => {
        calls += 1;
        return { found: false };
      },
    });
    const missing = fakeStore("missing");
    await assert.rejects(
      processReferenceCheck(
        job,
        { checkers: counting, store: missing.store },
        { isFinal: false },
      ),
      /not saved yet/,
    );
    assert.equal(
      await processReferenceCheck(
        job,
        { checkers: counting, store: missing.store },
        { isFinal: true },
      ),
      "superseded",
    );
    const superseded = fakeStore("superseded");
    assert.equal(
      await processReferenceCheck(
        job,
        { checkers: counting, store: superseded.store },
        { isFinal: false },
      ),
      "superseded",
    );
    assert.equal(calls, 0);
    assert.deepEqual([...missing.saved, ...superseded.saved], []);
  });
});

const URL = "https://example.org/report";
const SNAPSHOT = {
  archiveUrl: `https://web.archive.org/web/20240102030405/${URL}`,
  capturedAt: "2024-01-02T03:04:05Z",
};

function fakeArchive(overrides: Partial<WebArchive>): WebArchive {
  return {
    canCapture: false,
    findSnapshot: async () => null,
    requestCapture: async () => ({ jobId: "job" }),
    captureStatus: async () => ({ state: "pending" }),
    ...overrides,
  };
}

function linkStore(status: LinkArchiveStatus | null = null) {
  const saved: LinkArchiveRecord[] = [];
  return {
    saved,
    store: {
      linkArchiveStatus: async () => status,
      saveLinkArchive: async (_url: string, record: LinkArchiveRecord) => {
        saved.push(record);
      },
    },
  };
}

const noWait = async () => undefined;

describe("processReferenceCheck on its last attempt", () => {
  it("records an unexpected error as a check that could not finish", async () => {
    const { store, saved } = fakeStore("pending");
    const broken = checkers({
      lookupDoi: async () => {
        throw new TypeError("parser bug");
      },
    });
    await assert.rejects(
      processReferenceCheck(
        job,
        { checkers: broken, store },
        { isFinal: false },
      ),
      TypeError,
    );
    assert.equal(saved.length, 0);
    await assert.rejects(
      processReferenceCheck(
        job,
        { checkers: broken, store },
        { isFinal: true },
      ),
      TypeError,
    );
    assert.deepEqual(saved, [
      {
        status: "failed",
        message:
          "The check failed unexpectedly. Save the reference to try again.",
      },
    ]);
  });
});

describe("linkArchiveJobSchema and linkJobId", () => {
  it("accepts web links and gives each link one job id", () => {
    assert.equal(linkArchiveJobSchema.safeParse({ url: URL }).success, true);
    assert.equal(
      linkArchiveJobSchema.safeParse({ url: "file:///etc/passwd" }).success,
      false,
    );
    assert.equal(linkJobId(URL), linkJobId(URL));
    assert.notEqual(linkJobId(URL), linkJobId(`${URL}?page=2`));
    assert.match(linkJobId(URL), /^link-[0-9a-f]{32}$/);
  });
});

describe("processLinkArchive", () => {
  it("without keys, stores the closest existing copy", async () => {
    const { store, saved } = linkStore();
    const archive = fakeArchive({ findSnapshot: async () => SNAPSHOT });
    await processLinkArchive(
      { url: URL },
      { archive, store, wait: noWait },
      { isFinal: false },
    );
    assert.deepEqual(saved, [
      {
        status: "archived",
        ...SNAPSHOT,
        message: "The closest copy in the Wayback Machine.",
      },
    ]);
  });

  it("without keys or a copy, says how to get one", async () => {
    const { store, saved } = linkStore();
    await processLinkArchive(
      { url: URL },
      { archive: fakeArchive({}), store, wait: noWait },
      { isFinal: false },
    );
    assert.equal(saved[0]?.status, "not_archived");
    assert.match(saved[0]?.message ?? "", /Add Internet Archive keys/);
  });

  it("with keys, saves a fresh copy and polls until it is ready", async () => {
    const { store, saved } = linkStore();
    const statuses: CaptureStatus[] = [
      { state: "pending" },
      { state: "saved", snapshot: SNAPSHOT },
    ];
    let snapshotLookups = 0;
    const archive = fakeArchive({
      canCapture: true,
      captureStatus: async () => statuses.shift() ?? { state: "pending" },
      findSnapshot: async () => {
        snapshotLookups += 1;
        return null;
      },
    });
    await processLinkArchive(
      { url: URL },
      { archive, store, wait: noWait },
      { isFinal: false },
    );
    assert.deepEqual(saved, [
      {
        status: "archived",
        ...SNAPSHOT,
        message: "Saved by the Wayback Machine.",
      },
    ]);
    assert.equal(snapshotLookups, 0);
  });

  it("falls back to an earlier copy when saving is refused", async () => {
    const { store, saved } = linkStore();
    const archive = fakeArchive({
      canCapture: true,
      requestCapture: async () => ({ refused: "This URL is blocked." }),
      findSnapshot: async () => SNAPSHOT,
    });
    await processLinkArchive(
      { url: URL },
      { archive, store, wait: noWait },
      { isFinal: false },
    );
    assert.equal(saved[0]?.status, "archived");
    assert.match(
      saved[0]?.message ?? "",
      /could not be saved \(This URL is blocked\.\)/,
    );
  });

  it("retries while the archive is busy, and records failure on the last attempt", async () => {
    const { store, saved } = linkStore();
    const archive = fakeArchive({
      findSnapshot: async () => {
        throw new SourceUnavailableError(
          "The Wayback Machine",
          "is limiting requests",
        );
      },
    });
    const deps = { archive, store, wait: noWait };
    await assert.rejects(
      processLinkArchive({ url: URL }, deps, { isFinal: false }),
      SourceUnavailableError,
    );
    // Not deepEqual: it would narrow saved to never[] for the lines below.
    assert.equal(saved.length, 0);
    await processLinkArchive({ url: URL }, deps, { isFinal: true });
    assert.equal(saved[0]?.status, "failed");
    assert.match(saved[0]?.message ?? "", /limiting requests/);
  });

  it("falls back to an existing copy when saving fails for now", async () => {
    const { store, saved } = linkStore();
    const busy = async (): Promise<never> => {
      throw new SourceUnavailableError(
        "The Wayback Machine",
        "is limiting requests",
      );
    };
    const withCopy = fakeArchive({
      canCapture: true,
      requestCapture: busy,
      findSnapshot: async () => SNAPSHOT,
    });
    await processLinkArchive(
      { url: URL },
      { archive: withCopy, store, wait: noWait },
      { isFinal: false },
    );
    assert.equal(saved[0]?.status, "archived");
    assert.match(
      saved[0]?.message ?? "",
      /could not be saved \(The Wayback Machine is limiting requests\.\)/,
    );

    // With no copy to fall back on, it tries again later.
    const noCopy = fakeArchive({ canCapture: true, requestCapture: busy });
    await assert.rejects(
      processLinkArchive(
        { url: URL },
        { archive: noCopy, store, wait: noWait },
        { isFinal: false },
      ),
      SourceUnavailableError,
    );
  });

  it("records sites the archive refuses, without retrying", async () => {
    const { store, saved } = linkStore();
    const archive = fakeArchive({
      findSnapshot: async () => {
        throw new ArchiveRefusedError(
          "The Wayback Machine refuses to show copies of this page (403).",
        );
      },
    });
    await processLinkArchive(
      { url: URL },
      { archive, store, wait: noWait },
      { isFinal: false },
    );
    assert.deepEqual(saved, [
      {
        status: "not_archived",
        archiveUrl: null,
        capturedAt: null,
        message:
          "The Wayback Machine refuses to show copies of this page (403). Paste a copy from another archive.",
      },
    ]);
  });

  it("records an unexpected error as failed on the last attempt", async () => {
    const { store, saved } = linkStore();
    const archive = fakeArchive({
      findSnapshot: async () => {
        throw new TypeError("parser bug");
      },
    });
    await assert.rejects(
      processLinkArchive(
        { url: URL },
        { archive, store, wait: noWait },
        { isFinal: true },
      ),
      TypeError,
    );
    assert.equal(saved[0]?.status, "failed");
    assert.match(saved[0]?.message ?? "", /failed unexpectedly/);
  });

  it("leaves links that are already archived alone", async () => {
    const { store, saved } = linkStore("archived");
    assert.equal(
      await processLinkArchive(
        { url: URL },
        { archive: fakeArchive({}), store, wait: noWait },
        { isFinal: false },
      ),
      "skipped",
    );
    assert.deepEqual(saved, []);
  });
});
