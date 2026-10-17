import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { decodeCursor, encodeCursor } from "../src/postgres.ts";
import { InvalidCursorError } from "../src/topic-search.ts";

// Synthetic ids and times.
const ID = "01920000-0000-7000-8000-000000000001";
const AT = "2026-10-17T12:00:00.000Z";

describe("page cursors", () => {
  it("give back the keys they were made from, for the same sort", () => {
    assert.deepEqual(decodeCursor("newest", encodeCursor("newest", [AT, ID])), [
      AT,
      ID,
    ]);
    assert.deepEqual(
      decodeCursor("relevance", encodeCursor("relevance", [0.0607927, AT, ID])),
      [0.0607927, AT, ID],
    );
    assert.deepEqual(
      decodeCursor("referenced", encodeCursor("referenced", [3, AT, ID])),
      [3, AT, ID],
    );
  });

  it("refuse a cursor made for another sort", () => {
    const cursor = encodeCursor("newest", [AT, ID]);
    assert.throws(() => decodeCursor("updated", cursor), InvalidCursorError);
  });

  it("refuse anything the index did not issue", () => {
    const forged = [
      "",
      "not base64!",
      Buffer.from("not json").toString("base64url"),
      encodeCursor("newest", [AT, "not-a-uuid"]),
      encodeCursor("newest", ["yesterday", ID]),
      encodeCursor("referenced", [-1, AT, ID]),
      encodeCursor("newest", [AT, ID, "extra"]),
      "a".repeat(301),
    ];
    for (const cursor of forged) {
      assert.throws(
        () => decodeCursor("newest", cursor),
        InvalidCursorError,
        cursor,
      );
    }
  });
});
