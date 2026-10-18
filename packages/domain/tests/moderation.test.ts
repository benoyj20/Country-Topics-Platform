import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  COMMENT_LINKS_MAX,
  commentLinkCount,
  commentLinkProblem,
  commentSegments,
  NEW_ACCOUNT_LINK_WAIT_MS,
} from "../src/comment-links.ts";
import {
  type CommentModeration,
  commentModerationProblem,
} from "../src/moderation.ts";

describe("commentSegments", () => {
  it("links http, https, and www addresses and leaves the rest as text", () => {
    assert.deepEqual(
      commentSegments("See https://example.org/a?b=1 and www.example.org."),
      [
        { text: "See " },
        {
          text: "https://example.org/a?b=1",
          href: "https://example.org/a?b=1",
        },
        { text: " and " },
        { text: "www.example.org", href: "https://www.example.org/" },
        { text: "." },
      ],
    );
    assert.deepEqual(commentSegments("Plain example.org text"), [
      { text: "Plain example.org text" },
    ]);
  });

  it("keeps balanced brackets and drops closing punctuation", () => {
    assert.deepEqual(
      commentSegments("(see https://en.example.org/wiki/A_(b)), then"),
      [
        { text: "(see " },
        {
          text: "https://en.example.org/wiki/A_(b)",
          href: "https://en.example.org/wiki/A_(b)",
        },
        { text: "), then" },
      ],
    );
  });

  it("never links other schemes, addresses inside words, or hosts without a dot", () => {
    for (const text of [
      "javascript:alert(1)",
      "xhttps://example.org",
      "mail@www.example.org",
      "http://localhost/admin",
      "https://.",
      "https://bank.example@evil.example/login",
    ]) {
      assert.equal(commentLinkCount(text), 0, text);
    }
  });

  it("gives back the whole text", () => {
    const text = "a https://example.org b\nwww.example.net/x?y=(1) c";
    assert.equal(
      commentSegments(text)
        .map((segment) => segment.text)
        .join(""),
      text,
    );
  });
});

describe("commentLinkProblem", () => {
  const joined = new Date("2026-10-17T12:00:00Z");
  const later = (ms: number) => new Date(joined.getTime() + ms);

  it("lets anyone post text without links", () => {
    assert.equal(
      commentLinkProblem({
        links: 0,
        accountCreatedAt: joined,
        staff: false,
        now: joined,
      }),
      null,
    );
  });

  it("makes new members wait, but not staff", () => {
    const early = {
      links: 1,
      accountCreatedAt: joined,
      now: later(NEW_ACCOUNT_LINK_WAIT_MS - 1),
    };
    assert.match(
      commentLinkProblem({ ...early, staff: false }) ?? "",
      /from 20 October \(UTC\)/,
    );
    assert.equal(commentLinkProblem({ ...early, staff: true }), null);
    assert.equal(
      commentLinkProblem({
        links: 1,
        accountCreatedAt: joined,
        staff: false,
        now: later(NEW_ACCOUNT_LINK_WAIT_MS),
      }),
      null,
    );
  });

  it("limits links per comment for everyone", () => {
    assert.match(
      commentLinkProblem({
        links: COMMENT_LINKS_MAX + 1,
        accountCreatedAt: joined,
        staff: true,
        now: later(NEW_ACCOUNT_LINK_WAIT_MS * 10),
      }) ?? "",
      /at most 3 links/,
    );
  });
});

describe("commentModerationProblem", () => {
  const visible: CommentModeration = {
    status: "visible",
    reason: null,
    locked: false,
  };
  const hidden: CommentModeration = {
    status: "hidden",
    reason: "spam",
    locked: false,
  };
  const removed: CommentModeration = { ...hidden, status: "removed" };
  const check = (
    previous: CommentModeration,
    next: CommentModeration,
    { admin = false, thread = true } = {},
  ) =>
    commentModerationProblem({ previous, next, admin, thread })?.message ??
    null;

  it("lets moderators hide and show comments with a reason", () => {
    assert.equal(check(visible, hidden), null);
    assert.equal(check(hidden, { ...visible, reason: "spam" }), null);
    assert.match(check(visible, { ...hidden, reason: null }) ?? "", /why/);
  });

  it("lets only admins remove, and nobody restore, a comment", () => {
    assert.match(check(visible, removed) ?? "", /Only admins/);
    assert.equal(check(visible, removed, { admin: true }), null);
    assert.match(check(removed, visible, { admin: true }) ?? "", /cannot/);
    assert.match(check(removed, hidden, { admin: true }) ?? "", /cannot/);
  });

  it("leaves deleting to account deletion, which staff cannot undo", () => {
    const deleted: CommentModeration = { ...visible, status: "deleted" };
    assert.match(
      check(visible, deleted, { admin: true }) ?? "",
      /only with their author's account/,
    );
    assert.match(check(deleted, visible, { admin: true }) ?? "", /erased/);
    assert.match(check(deleted, hidden, { admin: true }) ?? "", /erased/);
    // Staff can still lock its thread; it needs no reason.
    assert.equal(check(deleted, { ...deleted, locked: true }), null);
  });

  it("locks threads only", () => {
    assert.equal(check(visible, { ...visible, locked: true }), null);
    assert.match(
      check(visible, { ...visible, locked: true }, { thread: false }) ?? "",
      /starts a thread/,
    );
  });
});
