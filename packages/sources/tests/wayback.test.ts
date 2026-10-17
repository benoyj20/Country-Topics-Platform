import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  type Fetch,
  type SourceClient,
  SourceUnavailableError,
} from "../src/http.ts";
import { ArchiveRefusedError, createWebArchive } from "../src/wayback.ts";

// Synthetic responses shaped like the Wayback Machine CDX API and
// Save Page Now 2; example.org is a reserved documentation domain.
const PAGE = "https://example.org/report";
const CDX = `https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(PAGE)}&output=json&limit=-1&filter=statuscode%3A200&fl=timestamp%2Coriginal`;

type Call = { url: string; method: string; headers: Headers; body: string };

function fakeFetch(answer: (call: Call) => { status?: number; body: unknown }) {
  const calls: Call[] = [];
  const fetch: Fetch = async (input, init) => {
    const call = {
      url: String(input),
      method: init?.method ?? "GET",
      headers: new Headers(init?.headers),
      body: init?.body ? String(init.body) : "",
    };
    calls.push(call);
    const { status = 200, body } = answer(call);
    return new Response(JSON.stringify(body), { status });
  };
  return { fetch, calls };
}

const client = (fetch: Fetch): SourceClient => ({
  fetch,
  userAgent: "CountryTopicsPlatform/0.1 (test)",
  timeoutMs: 1_000,
});
const keys = { accessKey: "test-access", secretKey: "test-secret" };

describe("findSnapshot", () => {
  it("returns the latest copy of the page that answered 200", async () => {
    const { fetch, calls } = fakeFetch(() => ({
      body: [
        ["timestamp", "original"],
        ["20240102030405", "https://example.org/report"],
      ],
    }));
    assert.deepEqual(await createWebArchive(client(fetch)).findSnapshot(PAGE), {
      archiveUrl:
        "https://web.archive.org/web/20240102030405/https://example.org/report",
      capturedAt: "2024-01-02T03:04:05Z",
    });
    assert.equal(calls[0]?.url, CDX);
  });

  it("returns null when there is no copy, and throws on an odd answer", async () => {
    const none = fakeFetch(() => ({ body: [] }));
    assert.equal(
      await createWebArchive(client(none.fetch)).findSnapshot(PAGE),
      null,
    );
    const odd = fakeFetch(() => ({ body: { archived_snapshots: {} } }));
    await assert.rejects(
      createWebArchive(client(odd.fetch)).findSnapshot(PAGE),
      SourceUnavailableError,
    );
  });

  it("reports sites the archive refuses to show as refused, not temporary", async () => {
    const blocked = fakeFetch(() => ({ status: 403, body: {} }));
    await assert.rejects(
      createWebArchive(client(blocked.fetch)).findSnapshot(PAGE),
      ArchiveRefusedError,
    );
  });
});

describe("Save Page Now", () => {
  it("is only available with keys", () => {
    const { fetch } = fakeFetch(() => ({ body: {} }));
    assert.equal(createWebArchive(client(fetch)).canCapture, false);
    assert.equal(createWebArchive(client(fetch), keys).canCapture, true);
  });

  it("requests a capture with the account's keys and polls its job", async () => {
    const { fetch, calls } = fakeFetch((call) => {
      if (call.method === "POST")
        return { body: { url: PAGE, job_id: "spn2-job" } };
      return {
        body: {
          status: "success",
          job_id: "spn2-job",
          timestamp: "20261014120000",
          original_url: PAGE,
        },
      };
    });
    const archive = createWebArchive(client(fetch), keys);
    assert.deepEqual(await archive.requestCapture(PAGE), { jobId: "spn2-job" });
    assert.equal(calls[0]?.url, "https://web.archive.org/save");
    assert.equal(
      calls[0]?.headers.get("Authorization"),
      "LOW test-access:test-secret",
    );
    assert.equal(calls[0]?.body, `url=${encodeURIComponent(PAGE)}`);

    assert.deepEqual(await archive.captureStatus("spn2-job"), {
      state: "saved",
      snapshot: {
        archiveUrl: `https://web.archive.org/web/20261014120000/${PAGE}`,
        capturedAt: "2026-10-14T12:00:00Z",
      },
    });
    assert.equal(calls[1]?.url, "https://web.archive.org/save/status/spn2-job");
  });

  it("reports pending jobs and pages that cannot be saved", async () => {
    const pending = fakeFetch(() => ({ body: { status: "pending" } }));
    assert.deepEqual(
      await createWebArchive(client(pending.fetch), keys).captureStatus("job"),
      { state: "pending" },
    );
    const blocked = fakeFetch(() => ({
      body: {
        status: "error",
        status_ext: "error:blocked-url",
        message: "This URL is in the Save Page Now service block list.",
      },
    }));
    assert.deepEqual(
      await createWebArchive(client(blocked.fetch), keys).captureStatus("job"),
      {
        state: "refused",
        message: "This URL is in the Save Page Now service block list.",
      },
    );
  });

  it("throws on temporary errors so the job tries again", async () => {
    const busy = fakeFetch(() => ({
      body: { status: "error", status_ext: "error:no-browsers-available" },
    }));
    await assert.rejects(
      createWebArchive(client(busy.fetch), keys).captureStatus("job"),
      SourceUnavailableError,
    );
    const refusedKeys = fakeFetch(() => ({ status: 401, body: {} }));
    await assert.rejects(
      createWebArchive(client(refusedKeys.fetch), keys).requestCapture(PAGE),
      /refused the configured keys/,
    );
  });
});
