import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  FEEDBACK_MESSAGE_MAX_LENGTH,
  FEEDBACK_PAGE_MAX_LENGTH,
  feedbackMessageProblem,
  feedbackPagePath,
  normalizeFeedbackMessage,
} from "../src/feedback.ts";

describe("feedbackMessageProblem", () => {
  it("needs some text, up to the limit", () => {
    assert.match(feedbackMessageProblem("") ?? "", /Write something/);
    assert.equal(feedbackMessageProblem("TEST the menu overlaps."), null);
    assert.equal(
      feedbackMessageProblem("a".repeat(FEEDBACK_MESSAGE_MAX_LENGTH)),
      null,
    );
    assert.match(
      feedbackMessageProblem("a".repeat(FEEDBACK_MESSAGE_MAX_LENGTH + 1)) ?? "",
      /at most 2,000/,
    );
  });

  it("is checked after tidying, which removes hidden controls", () => {
    assert.equal(normalizeFeedbackMessage("  ‮ \n\n\n"), "");
  });
});

describe("feedbackPagePath", () => {
  it("keeps a path on the site without its query or fragment", () => {
    assert.equal(feedbackPagePath("/"), "/");
    assert.equal(
      feedbackPagePath("/topics/test-topic?q=secret#comment-1"),
      "/topics/test-topic",
    );
  });

  it("refuses anything that is not a visible path on this site", () => {
    for (const value of [
      "",
      "topics",
      "https://evil.example/",
      "//evil.example/",
      "/\\evil.example",
      "/topics/a b",
      "/topics/é",
      `/${"a".repeat(FEEDBACK_PAGE_MAX_LENGTH)}`,
    ]) {
      assert.equal(feedbackPagePath(value), null, value);
    }
  });
});
