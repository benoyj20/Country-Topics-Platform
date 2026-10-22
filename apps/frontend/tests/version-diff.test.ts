import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { side, textDiff } from "../src/admin/versions/diff.ts";

// What a comparison of two versions marks (src/admin/versions): lines
// added or removed whole, and words within a line that changed.

const joined = (parts: { text: string }[]) =>
  parts.map((part) => part.text).join("");

describe("comparing two versions' text", () => {
  it("marks nothing when nothing changed", () => {
    assert.deepEqual(textDiff("Same text", "Same text"), [
      { kind: "same", text: "Same text" },
    ]);
    assert.deepEqual(textDiff("", ""), []);
  });

  it("marks the words that changed within a line", () => {
    const parts = textDiff(
      "The minister spoke on Monday",
      "The minister wrote on Tuesday",
    );
    assert.deepEqual(parts, [
      { kind: "same", text: "The minister " },
      { kind: "removed", text: "spoke" },
      { kind: "added", text: "wrote" },
      { kind: "same", text: " on " },
      { kind: "removed", text: "Monday" },
      { kind: "added", text: "Tuesday" },
    ]);
  });

  it("marks lines added or removed whole", () => {
    const before = "First paragraph\nSecond paragraph";
    const after = "First paragraph\nA new paragraph\nSecond paragraph";
    const parts = textDiff(before, after);
    assert.deepEqual(parts, [
      { kind: "same", text: "First paragraph\n" },
      { kind: "added", text: "A new paragraph\n" },
      { kind: "same", text: "Second paragraph" },
    ]);
    assert.equal(joined(side(parts, "before")), before);
    assert.equal(joined(side(parts, "after")), after);
  });

  it("gives each side its own text back", () => {
    const cases: [string, string][] = [
      ["", "Only after"],
      ["Only before", ""],
      ["one\ntwo\nthree", "one\n2\nthree\nfour"],
      ["a b c", "a  b c"],
      ["kept\nremoved at the end", "kept"],
      ["kept", "kept\nadded at the end"],
    ];
    for (const [before, after] of cases) {
      const parts = textDiff(before, after);
      assert.equal(
        joined(side(parts, "before")),
        before,
        `${before} → ${after}`,
      );
      assert.equal(joined(side(parts, "after")), after, `${before} → ${after}`);
    }
  });

  it("compares very long texts whole rather than word by word", () => {
    const before = Array.from({ length: 2_500 }, (_, n) => `line ${n}`).join(
      "\n",
    );
    const after = Array.from({ length: 2_500 }, (_, n) => `row ${n}`).join(
      "\n",
    );
    const parts = textDiff(before, after);
    assert.equal(joined(side(parts, "before")), before);
    assert.equal(joined(side(parts, "after")), after);
  });
});
