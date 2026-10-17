import type {
  TopicSearchDocument,
  TopicSearchIndex,
} from "@countrytopics/search";
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  processSearchJob,
  SEARCH_JOB_MAX_TOPICS,
  searchJobSchema,
  type TopicSearchSource,
  type TopicSearchState,
} from "../src/search-jobs.ts";
import { topicDocument } from "../src/topic-search-source.ts";

// Synthetic ids, times, and text.
const id = (n: number) =>
  `01920000-0000-7000-8000-${String(n).padStart(12, "0")}`;
const AT = "2026-10-17T12:00:00.000Z";
const LATER = "2026-10-17T12:05:00.000Z";

function document(topicId: string): TopicSearchDocument {
  return {
    topicId,
    slug: `topic-${topicId.slice(-2)}`,
    title: "A synthetic topic",
    summary: "",
    state: "published",
    firstPublishedAt: AT,
    lastPublishedAt: AT,
    countryIds: [],
    categoryId: null,
    tagIds: [],
    individualIds: [],
    evidenceKinds: [],
    languages: [],
    referenceCount: 0,
    text: { title: "", summary: "", body: "", evidence: "" },
    version: AT,
  };
}

function fakes({
  topics,
  indexed = new Map(),
  visible = true,
  newer = [],
}: {
  topics: Map<string, TopicSearchState>;
  /** Indexed topics, with their documents' versions. */
  indexed?: Map<string, string>;
  visible?: boolean;
  /** Topics the index already holds in a newer version. */
  newer?: string[];
}) {
  const upserted: string[] = [];
  const removed: [string, string | null][] = [];
  const source: TopicSearchSource = {
    listedTopicIds: async () =>
      [...topics].filter(([, state]) => state.document).map(([key]) => key),
    topicStates: async (ids) =>
      new Map(
        ids.flatMap((key) => {
          const state = topics.get(key);
          return state ? [[key, state] as const] : [];
        }),
      ),
    changeVisible: async () => visible,
  };
  const index: TopicSearchIndex = {
    upsert: async (doc) => {
      if (newer.includes(doc.topicId)) return false;
      upserted.push(doc.topicId);
      return true;
    },
    remove: async (topicId, version) => {
      removed.push([topicId, version]);
    },
    indexedVersions: async () => indexed,
    search: async () => {
      throw new Error("not used");
    },
  };
  return { source, index, upserted, removed };
}

describe("processSearchJob", () => {
  it("indexes listed topics and removes the others, with the version it read", async () => {
    const run = fakes({
      topics: new Map([
        [id(1), { document: document(id(1)), version: AT }],
        [id(2), { document: null, version: LATER }],
      ]),
    });
    const outcome = await processSearchJob(
      { topicIds: [id(1), id(2), id(3)] },
      run,
      { isFinal: false },
    );
    assert.deepEqual(outcome, {
      indexed: 1,
      kept: 0,
      unchanged: 0,
      removed: 2,
    });
    assert.deepEqual(run.upserted, [id(1)]);
    // An archived topic keeps a newer copy; a deleted one goes regardless.
    assert.deepEqual(run.removed, [
      [id(2), LATER],
      [id(3), null],
    ]);
  });

  it("counts a document the index already holds in a newer version as kept", async () => {
    const run = fakes({
      topics: new Map([[id(1), { document: document(id(1)), version: AT }]]),
      newer: [id(1)],
    });
    assert.deepEqual(
      await processSearchJob({ topicIds: [id(1)] }, run, { isFinal: false }),
      { indexed: 0, kept: 1, unchanged: 0, removed: 0 },
    );
  });

  it("waits for the save that queued it, then indexes what it finds on the last try", async () => {
    const after = { table: "topics" as const, id: id(1), updatedAt: LATER };
    const run = fakes({
      topics: new Map([[id(1), { document: document(id(1)), version: AT }]]),
      visible: false,
    });
    await assert.rejects(
      processSearchJob({ topicIds: [id(1)], after }, run, { isFinal: false }),
      /not saved yet/,
    );
    assert.deepEqual(run.upserted, []);
    await processSearchJob({ topicIds: [id(1)], after }, run, {
      isFinal: true,
    });
    assert.deepEqual(run.upserted, [id(1)]);
  });

  it("rebuilds every listed topic and drops indexed ones no longer listed", async () => {
    const run = fakes({
      topics: new Map([
        [id(1), { document: document(id(1)), version: AT }],
        [id(2), { document: null, version: AT }],
      ]),
      indexed: new Map([
        [id(2), AT],
        [id(9), AT],
      ]),
    });
    const outcome = await processSearchJob({ rebuild: true }, run, {
      isFinal: false,
    });
    assert.deepEqual(outcome, {
      indexed: 1,
      kept: 0,
      unchanged: 0,
      removed: 2,
    });
    assert.deepEqual(run.removed, [
      [id(2), AT],
      [id(9), null],
    ]);
  });

  it("leaves documents a rebuild finds up to date alone", async () => {
    const run = fakes({
      topics: new Map([
        [id(1), { document: document(id(1)), version: AT }],
        [
          id(2),
          { document: { ...document(id(2)), version: LATER }, version: LATER },
        ],
      ]),
      indexed: new Map([
        [id(1), AT],
        [id(2), AT],
      ]),
    });
    const outcome = await processSearchJob({ rebuild: true }, run, {
      isFinal: false,
    });
    assert.deepEqual(outcome, {
      indexed: 1,
      kept: 0,
      unchanged: 1,
      removed: 0,
    });
    assert.deepEqual(run.upserted, [id(2)]);
  });
});

describe("searchJobSchema", () => {
  it("accepts topic ids with the save to wait for, and rebuilds", () => {
    assert.ok(
      searchJobSchema.safeParse({
        topicIds: [id(1)],
        after: { table: "individuals", id: id(2), updatedAt: AT },
      }).success,
    );
    assert.ok(searchJobSchema.safeParse({ rebuild: true }).success);
  });

  it("refuses anything else", () => {
    const invalid = [
      {},
      { topicIds: [] },
      { topicIds: ["not-a-uuid"] },
      {
        topicIds: Array.from({ length: SEARCH_JOB_MAX_TOPICS + 1 }, (_, n) =>
          id(n),
        ),
      },
      {
        topicIds: [id(1)],
        after: { table: "users", id: id(2), updatedAt: AT },
      },
      { rebuild: false },
    ];
    for (const job of invalid) {
      assert.equal(searchJobSchema.safeParse(job).success, false);
    }
  });
});

describe("topicDocument", () => {
  const row = {
    id: id(1),
    slug: "a-synthetic-topic",
    title: "A synthetic topic",
    summary: "Its summary.",
    body: {
      root: {
        type: "root",
        children: [
          { type: "paragraph", children: [{ type: "text", text: "Body." }] },
        ],
      },
    },
    listed: true,
    state: "updated",
    first_published_at: new Date(AT),
    last_published_at: null,
    updated_at: new Date(AT),
    version: new Date(LATER),
    category_id: id(2),
    category_name: "Test category",
    country_ids: [id(3)],
    country_names: ["Testland"],
    tag_ids: [],
    tag_names: [],
    individual_ids: [id(4)],
    individual_names: ["Test Person Alias"],
    evidence_kinds: ["snippet" as const],
    languages: ["en"],
    evidence_text: "A caption",
    reference_count: 2,
  };

  it("matches the summary together with the names it shows", () => {
    const doc = topicDocument(row);
    assert.equal(doc?.state, "updated");
    assert.equal(doc?.lastPublishedAt, AT);
    assert.equal(doc?.version, LATER);
    assert.equal(doc?.text.body, "Body.");
    assert.equal(
      doc?.text.summary,
      "Its summary.\nTestland\nTest category\nTest Person Alias",
    );
  });

  it("is null for topics that are not listed", () => {
    assert.equal(topicDocument({ ...row, listed: false }), null);
  });
});
