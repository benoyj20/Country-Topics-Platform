import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  listConditions,
  listHref,
  readListState,
  sortAfter,
} from "../src/admin/list-state.ts";

describe("a list's address", () => {
  it("reads search, sort, page size, page, and filters", () => {
    const state = readListState("topics", {
      search: " ghana ",
      sort: "title",
      limit: "25",
      page: "3",
      state: "published",
      countries: "Ghana",
      archived: "no",
      "updatedAt.from": "2026-10-01",
      "updatedAt.to": "2026-10-31",
    });
    assert.deepEqual(state, {
      search: "ghana",
      sort: "title",
      limit: 25,
      page: 3,
      filters: [
        { field: "state", kind: "equals", value: "published" },
        { field: "countries", kind: "related", value: "Ghana" },
        { field: "archived", kind: "equals", value: "no" },
        {
          field: "updatedAt",
          kind: "dates",
          from: "2026-10-01",
          to: "2026-10-31",
        },
      ],
    });
  });

  it("falls back to the list's defaults for anything it does not know", () => {
    const state = readListState("topics", {
      sort: "body",
      limit: "1000",
      page: "-2",
      state: "lost",
      archived: "maybe",
      "updatedAt.from": "2026-02-30",
      where: "[title][equals]=x",
    });
    assert.deepEqual(state, {
      search: "",
      sort: "-updatedAt",
      limit: 10,
      page: 1,
      filters: [],
    });
    // Relations are not sortable, as in Payload's panel.
    assert.equal(
      readListState("topics", { sort: "countries" }).sort,
      "-updatedAt",
    );
    assert.equal(readListState("countries", {}).limit, 50);
    assert.equal(
      readListState("comment-reports", { sort: "status,-createdAt" }).sort,
      "status,-createdAt",
    );
  });

  it("is written back the same way, with defaults left out", () => {
    const params = {
      search: "ghana",
      state: "published",
      "updatedAt.from": "2026-10-01",
      sort: "title",
      page: "2",
    };
    const state = readListState("topics", params);
    const href = listHref("topics", state);
    assert.equal(
      href,
      "/admin/collections/topics?search=ghana&state=published&updatedAt.from=2026-10-01&sort=title&page=2",
    );
    const again = Object.fromEntries(new URL(href, "http://x").searchParams);
    assert.deepEqual(readListState("topics", again), state);
    assert.equal(
      listHref("topics", readListState("topics", {})),
      "/admin/collections/topics",
    );
  });

  it("sorts a column ascending, then descending", () => {
    const state = readListState("topics", {});
    assert.equal(sortAfter(state, "title"), "title");
    assert.equal(sortAfter({ ...state, sort: "title" }, "title"), "-title");
    assert.equal(sortAfter({ ...state, sort: "-title" }, "title"), "title");
  });
});

describe("a list's conditions", () => {
  it("become Payload's, related titles by the ids they matched", () => {
    const id = "01a14b46-fab3-7427-82d5-12bb98c35450";
    const state = readListState("comments", {
      status: "hidden",
      locked: "yes",
      parent: "no",
      topic: "Ghana",
      author: id,
      "createdAt.to": "2026-10-21",
    });
    assert.deepEqual(
      listConditions("comments", state, new Map([["topic", ["t1", "t2"]]])),
      [
        { field: "status", equals: "hidden" },
        { field: "topic", in: ["t1", "t2"] },
        { field: "author", in: [id] },
        { field: "locked", equals: true },
        { field: "parent", exists: false },
        { field: "createdAt", from: undefined, to: "2026-10-21T23:59:59.999Z" },
      ],
    );
  });
});
