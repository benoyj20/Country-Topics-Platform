import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ADMIN_COLLECTIONS,
  ADMIN_LISTS,
  adminListSearchParams,
  adminPageSchema,
  adminRelatedSearchParams,
  adminRowSchema,
  relatedTitle,
} from "../src/index.ts";

const entries = (params: URLSearchParams) => [...params.entries()];

describe("the admin's list definitions", () => {
  it("show, search, and filter only fields they define", () => {
    for (const collection of ADMIN_COLLECTIONS) {
      const list = ADMIN_LISTS[collection];
      for (const field of [list.title, ...list.columns, ...list.search]) {
        assert.ok(list.fields[field], `${collection}.${field}`);
      }
      for (const field of Object.keys(list.filters)) {
        assert.ok(list.fields[field], `${collection} filter ${field}`);
      }
      // Searched by title too, except a report's, a reason chosen from a list.
      if (collection !== "comment-reports") {
        assert.ok(list.search.includes(list.title), collection);
      }
    }
  });
});

describe("adminListSearchParams", () => {
  it("asks for one page, the list's fields, and related titles only", () => {
    const params = adminListSearchParams("topics", {
      search: " ghana elections ",
      conditions: [
        { field: "state", equals: "published" },
        { field: "countries", in: ["a", "b"] },
        { field: "archived", equals: false },
        { field: "updatedAt", from: "2026-10-01T00:00:00.000Z" },
      ],
      sort: "-updatedAt",
      page: 2,
      limit: 25,
    });
    assert.deepEqual(entries(params), [
      ["depth", "1"],
      ["limit", "25"],
      ["page", "2"],
      ["sort", "-updatedAt"],
      ["draft", "true"],
      ["where[and][0][or][0][title][like]", "ghana elections"],
      ["where[and][0][or][1][summary][like]", "ghana elections"],
      ["where[and][1][state][equals]", "published"],
      ["where[and][2][countries][in][0]", "a"],
      ["where[and][2][countries][in][1]", "b"],
      ["where[and][3][archived][equals]", "false"],
      [
        "where[and][4][updatedAt][greater_than_equal]",
        "2026-10-01T00:00:00.000Z",
      ],
      ["select[title]", "true"],
      ["select[state]", "true"],
      ["select[countries]", "true"],
      ["select[updatedAt]", "true"],
      ["populate[countries][name]", "true"],
    ]);
  });

  it("leaves out the where clause, and drafts, when nothing asks for them", () => {
    const params = adminListSearchParams("tags", {
      conditions: [],
      sort: "name",
      page: 1,
      limit: 10,
    });
    assert.equal(params.get("draft"), null);
    assert.equal(
      [...params.keys()].some((key) => key.startsWith("where")),
      false,
    );
  });

  it("finds related topics by their newest titles, drafts included", () => {
    assert.equal(
      adminRelatedSearchParams("topics", "water").get("draft"),
      "true",
    );
  });

  it("finds related records by their title", () => {
    assert.deepEqual(entries(adminRelatedSearchParams("users", " ana ")), [
      ["depth", "0"],
      ["limit", "100"],
      ["select[email]", "true"],
      ["where[email][like]", "ana"],
    ]);
  });
});

describe("a list's records", () => {
  const page = adminPageSchema(adminRowSchema("comments"));
  const answer = (doc: Record<string, unknown>) => ({
    docs: [{ id: "c1", ...doc }],
    totalDocs: 1,
    limit: 10,
    page: 1,
    totalPages: 1,
    hasNextPage: false,
    hasPrevPage: false,
  });

  it("take related records as titled objects or bare ids", () => {
    const parsed = page.parse(
      answer({
        body: "TEST",
        topic: { id: "t1", title: "TEST topic" },
        author: "u1",
        status: "visible",
        createdAt: "2026-10-21T12:00:00.000Z",
      }),
    );
    const [doc] = parsed.docs;
    assert.deepEqual(relatedTitle("topics", doc?.topic), {
      id: "t1",
      title: "TEST topic",
    });
    assert.deepEqual(relatedTitle("users", doc?.author), {
      id: "u1",
      title: null,
    });
    assert.equal(relatedTitle("users", null), null);
  });

  it("refuse a value the backend does not store", () => {
    assert.equal(page.safeParse(answer({ status: "lost" })).success, false);
  });
});
