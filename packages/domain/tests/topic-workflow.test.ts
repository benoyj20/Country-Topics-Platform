import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  changeNoteRequired,
  type TopicSave,
  topicChangeKind,
  topicStateAfterSave,
} from "../src/topic-workflow.ts";

const save = (overrides: Partial<TopicSave>): TopicSave => ({
  publishing: false,
  previouslyPublished: false,
  previouslyArchived: false,
  archived: false,
  readyForReview: false,
  ...overrides,
});

describe("topicStateAfterSave", () => {
  it("keeps unpublished topics in draft or in review", () => {
    assert.equal(topicStateAfterSave(save({})), "draft");
    assert.equal(
      topicStateAfterSave(save({ readyForReview: true })),
      "in_review",
    );
  });

  it("publishes, then updates, then archives", () => {
    assert.equal(topicStateAfterSave(save({ publishing: true })), "published");
    assert.equal(
      topicStateAfterSave(
        save({ publishing: true, previouslyPublished: true }),
      ),
      "updated",
    );
    assert.equal(
      topicStateAfterSave(
        save({ publishing: true, previouslyPublished: true, archived: true }),
      ),
      "archived",
    );
  });

  it("leaves a published topic's state alone while a draft is saved", () => {
    assert.equal(
      topicStateAfterSave(
        save({ previouslyPublished: true, readyForReview: true }),
      ),
      null,
    );
  });
});

describe("topicChangeKind", () => {
  it("adds no entry for drafts", () => {
    assert.equal(topicChangeKind(save({ previouslyPublished: true })), null);
  });

  it("names each kind of publish", () => {
    assert.equal(topicChangeKind(save({ publishing: true })), "published");
    const republish = { publishing: true, previouslyPublished: true };
    assert.equal(topicChangeKind(save(republish)), "updated");
    assert.equal(
      topicChangeKind(save({ ...republish, archived: true })),
      "archived",
    );
    assert.equal(
      topicChangeKind(
        save({ ...republish, archived: true, previouslyArchived: true }),
      ),
      "updated",
    );
    assert.equal(
      topicChangeKind(save({ ...republish, previouslyArchived: true })),
      "restored",
    );
  });
});

describe("changeNoteRequired", () => {
  it("asks for a note on every publish after the first", () => {
    assert.equal(changeNoteRequired(save({ publishing: true })), false);
    assert.equal(
      changeNoteRequired(save({ publishing: true, previouslyPublished: true })),
      true,
    );
    assert.equal(
      changeNoteRequired(save({ previouslyPublished: true })),
      false,
    );
  });
});
