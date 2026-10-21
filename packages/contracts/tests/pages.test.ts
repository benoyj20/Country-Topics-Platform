import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  HomePage,
  PAGE_DATA_PATHS,
  PAGE_DATA_TAGS,
  PUBLIC_TAGS,
  PublicEvidence,
  TopicPage,
} from "../src/index.ts";

const summary = {
  slug: "test-topic",
  title: "TEST topic",
  summary: "A fictional topic.",
  state: "published",
  firstPublishedAt: "2026-10-21T00:00:00.000Z",
  lastPublishedAt: "2026-10-21T00:00:00.000Z",
  countries: [{ name: "Kenya", slug: "kenya" }],
};

const topic = {
  ...summary,
  category: null,
  tags: [],
  people: [
    {
      individual: { name: "TEST Person", slug: "test-person" },
      role: "subject",
    },
  ],
  body: {
    root: {
      type: "root",
      children: [{ type: "paragraph", version: 1, children: [] }],
      direction: "ltr",
      format: "",
      indent: 0,
      version: 1,
    },
  },
  bodyLinks: {},
  evidence: [
    {
      kind: "link",
      title: null,
      note: null,
      url: "https://example.org/a",
      archive: null,
      otherArchiveUrl: null,
    },
  ],
  references: [],
  changes: [
    { kind: "published", note: "First published.", date: "2026-10-21" },
  ],
};

describe("the page contracts", () => {
  it("accept the data the pages render from", () => {
    assert.deepEqual(TopicPage.parse(topic), topic);
    assert.ok(
      HomePage.safeParse({
        topics: { items: [summary], more: false },
        countries: [],
      }).success,
    );
  });

  it("drop a field they do not list, such as a staff-only one", () => {
    assert.deepEqual(
      TopicPage.parse({ ...topic, lastEditedBy: "someone" }),
      topic,
    );
    const home = HomePage.parse({
      topics: { items: [{ ...summary, checkStatus: "pending" }], more: false },
      countries: [],
    });
    assert.deepEqual(home.topics.items, [summary]);
  });

  it("refuse evidence whose fields do not match its kind", () => {
    assert.equal(
      PublicEvidence.safeParse({
        kind: "image",
        title: null,
        note: null,
        url: "x",
      }).success,
      false,
    );
  });

  it("refuse a body that is not Lexical's JSON, or an unknown state", () => {
    assert.equal(
      TopicPage.safeParse({ ...topic, body: "text" }).success,
      false,
    );
    assert.equal(
      TopicPage.safeParse({ ...topic, body: { root: { type: "root" } } })
        .success,
      false,
    );
    assert.equal(
      TopicPage.safeParse({
        ...topic,
        body: { root: { ...topic.body.root, indent: "0" } },
      }).success,
      false,
    );
    assert.equal(
      TopicPage.safeParse({ ...topic, state: "draft" }).success,
      false,
    );
  });

  it("name the endpoints", () => {
    assert.equal(
      PAGE_DATA_PATHS.topic("test-topic"),
      "/api/v1/pages/topics/test-topic",
    );
    assert.equal(PAGE_DATA_PATHS.home, "/api/v1/pages/home");
    // Never a path that could reach another endpoint.
    for (const slug of ["../../account", "..", "Test", "a/b"]) {
      assert.throws(() => PAGE_DATA_PATHS.topic(slug));
    }
  });

  it("tag each page's data with the collections it reads", () => {
    assert.deepEqual(PAGE_DATA_TAGS.home, [
      PUBLIC_TAGS.topics,
      PUBLIC_TAGS.countries,
    ]);
    assert.ok(PAGE_DATA_TAGS.topic.includes(PUBLIC_TAGS.media));
  });
});
