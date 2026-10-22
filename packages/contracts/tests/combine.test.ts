import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ADMIN_COLLECTIONS, ADMIN_LISTS, combine } from "../src/index.ts";

describe("combine", () => {
  it("keeps every part's entries", () => {
    assert.deepEqual(combine("Test", { a: { x: 1 }, b: { y: 2, z: 3 } }), {
      x: 1,
      y: 2,
      z: 3,
    });
  });

  it("refuses two parts claiming one key", () => {
    assert.throws(
      () => combine("Test", { a: { x: 1 }, b: { x: 2 } }),
      /Test: both a and b claim x\./,
    );
  });

  it("gives every admin collection one list", () => {
    assert.deepEqual(
      Object.keys(ADMIN_LISTS).sort(),
      [...ADMIN_COLLECTIONS].sort(),
    );
  });
});
