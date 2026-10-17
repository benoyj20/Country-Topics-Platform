import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  COMMENT_BODY_MAX_LENGTH,
  commentBodyProblem,
  commentReportProblem,
  COMMENT_REPORT_NOTE_MAX_LENGTH,
  displayNameProblem,
  isCommentReportReason,
  isCommentSort,
  isCommentVoteValue,
  normalizeCommentBody,
  normalizeDisplayName,
} from "../src/comments.ts";

describe("normalizeCommentBody", () => {
  it("keeps line breaks and trims the rest", () => {
    assert.equal(
      normalizeCommentBody(
        "  First line.  \r\nSecond line.\r\n\r\n\r\n\n\nLast.  \n",
      ),
      "First line.\nSecond line.\n\nLast.",
    );
  });

  it("removes controls and bidirectional overrides but keeps tabs and RLM", () => {
    // Built from code points: these characters are invisible in source.
    const [nul, bel, nel, tab, rlo, lri, rlm] = [
      0x00, 0x07, 0x85, 0x09, 0x202e, 0x2066, 0x200f,
    ].map((code) => String.fromCodePoint(code));
    assert.equal(
      normalizeCommentBody(
        `a${nul}b${bel}c${rlo}d${lri}e${nel}f${tab}g${rlm}h`,
      ),
      `abcdef${tab}g${rlm}h`,
    );
  });

  it("composes characters, so equal text is stored equally", () => {
    const decomposed = `Cafe${String.fromCodePoint(0x301)}`;
    assert.equal(normalizeCommentBody(decomposed), "Café");
  });
});

describe("commentBodyProblem", () => {
  it("refuses empty and overlong comments", () => {
    assert.match(commentBodyProblem("") ?? "", /Write something/);
    assert.equal(commentBodyProblem("x".repeat(COMMENT_BODY_MAX_LENGTH)), null);
    assert.match(
      commentBodyProblem("x".repeat(COMMENT_BODY_MAX_LENGTH + 1)) ?? "",
      /at most 5,000/,
    );
  });
});

describe("commentReportProblem", () => {
  it("needs a note only for other reasons, and bounds it", () => {
    assert.equal(commentReportProblem("spam", ""), null);
    assert.match(commentReportProblem("other", "") ?? "", /Say what/);
    assert.equal(commentReportProblem("other", "Synthetic note."), null);
    assert.match(
      commentReportProblem(
        "abuse",
        "x".repeat(COMMENT_REPORT_NOTE_MAX_LENGTH + 1),
      ) ?? "",
      /at most 500/,
    );
  });
});

describe("display names", () => {
  it("tidies spaces", () => {
    assert.equal(normalizeDisplayName("  Test \t Member  "), "Test Member");
  });

  it("accepts names in any script with name punctuation", () => {
    for (const name of [
      "Test Member",
      "J. Test-Member",
      "O'Test",
      "Ástríður Test",
      "Тест Участник",
      "测试",
      "member_42",
    ]) {
      assert.equal(displayNameProblem(name), null, name);
    }
  });

  it("refuses short, long, symbol, emoji, and control names", () => {
    for (const name of [
      "T",
      "x".repeat(41),
      "-Test",
      "Test <b>",
      "Test 🙂",
      `Test${String.fromCodePoint(0x202e)}Member`,
      "@admin",
    ]) {
      assert.notEqual(displayNameProblem(name), null, name);
    }
  });

  it("counts characters, not UTF-16 units", () => {
    assert.equal(displayNameProblem("测".repeat(40)), null);
  });
});

describe("value checks", () => {
  it("knows the sorts, votes, and report reasons", () => {
    assert.ok(isCommentSort("top") && isCommentSort("old"));
    assert.ok(!isCommentSort("best"));
    assert.ok(isCommentVoteValue(1) && isCommentVoteValue(0));
    assert.ok(!isCommentVoteValue(2) && !isCommentVoteValue("1"));
    assert.ok(isCommentReportReason("off-topic"));
    assert.ok(!isCommentReportReason("dislike"));
  });
});
