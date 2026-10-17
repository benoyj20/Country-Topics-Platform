import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { richTextPlainText } from "../src/rich-text.ts";

const text = (value: string) => ({ type: "text", text: value });
const paragraph = (...children: unknown[]) => ({ type: "paragraph", children });

describe("richTextPlainText", () => {
  it("keeps the words of each block on their own line", () => {
    const body = {
      root: {
        type: "root",
        children: [
          { type: "heading", children: [text("A synthetic heading")] },
          paragraph(text("First "), text("words."), { type: "linebreak" }),
          paragraph(text("Second  paragraph.")),
        ],
      },
    };
    assert.equal(
      richTextPlainText(body),
      "A synthetic heading\nFirst words.\nSecond paragraph.",
    );
  });

  it("reads a link's text inline, not its address", () => {
    const body = {
      root: {
        type: "root",
        children: [
          paragraph(
            text("See "),
            {
              type: "link",
              fields: { url: "https://example.org/hidden" },
              children: [text("the report")],
            },
            text(" here."),
          ),
        ],
      },
    };
    assert.equal(richTextPlainText(body), "See the report here.");
  });

  it("gives nothing for values that are not Lexical documents", () => {
    for (const value of [null, undefined, "text", 3, {}, { root: null }]) {
      assert.equal(richTextPlainText(value), "");
    }
  });

  it("stops at a safe depth", () => {
    let node: Record<string, unknown> = text("deep");
    for (let depth = 0; depth < 500; depth += 1) node = paragraph(node);
    const body = { root: { type: "root", children: [node] } };
    assert.equal(richTextPlainText(body), "");
  });
});
