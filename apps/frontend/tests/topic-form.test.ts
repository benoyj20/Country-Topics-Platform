import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { EMPTY_TOPIC } from "@countrytopics/contracts";

import {
  clearMessages,
  fieldMessages,
  moveRow,
  savedForm,
  valuesAfterAnswer,
} from "../src/admin/topics/form-state.ts";
import { fieldName } from "../src/admin/topics/topic-text.ts";

describe("the topic form's rows", () => {
  it("move within their list, and stay put at its ends", () => {
    assert.deepEqual(moveRow(["a", "b", "c"], 0, 1), ["b", "a", "c"]);
    assert.deepEqual(moveRow(["a", "b", "c"], 2, 1), ["a", "c", "b"]);
    assert.deepEqual(moveRow(["a", "b"], 0, -1), ["a", "b"]);
    assert.deepEqual(moveRow(["a", "b"], 1, 2), ["a", "b"]);
  });
});

describe("a refusal's messages", () => {
  const refusal = {
    general: ["You are not allowed to perform this action."],
    fields: {
      title: ["This field is required."],
      evidence: [
        "This topic names individuals, so it needs at least one piece of evidence.",
      ],
      "evidence.0.url": ["Enter the page's link."],
      "evidence.10.title": ["Give the evidence a title."],
      "evidence.2.title": ["Give the evidence a title."],
      changeNote: ["Say what changed and why."],
    },
  };

  it("clear for a field as it changes, keeping the other rows'", () => {
    const cleared = clearMessages(refusal, "evidence");
    assert.equal(cleared.fields.evidence, undefined);
    assert.deepEqual(cleared.fields["evidence.0.url"], [
      "Enter the page's link.",
    ]);
    assert.deepEqual(cleared.general, refusal.general);
  });

  it("clear for every row when the rows move", () => {
    const cleared = clearMessages(refusal, "evidence", { rows: true });
    assert.deepEqual(Object.keys(cleared.fields).sort(), [
      "changeNote",
      "title",
    ]);
  });

  it("are listed in the form's order, rows by number", () => {
    const order = ["title", "evidence", "changeNote"];
    assert.deepEqual(
      fieldMessages(refusal, order).map(([key]) => key),
      [
        "title",
        "evidence",
        "evidence.0.url",
        "evidence.2.title",
        "evidence.10.title",
        "changeNote",
      ],
    );
  });

  it("name a row's field by its row", () => {
    assert.equal(fieldName("evidence.0.url"), "Evidence 1, Link");
    assert.equal(fieldName("references.2.passage"), "Reference 3, Passage");
    assert.equal(fieldName("people.0.individual"), "Individual 1, Individual");
    assert.equal(fieldName("changeNote"), "Change note");
  });
});

describe("unsaved changes", () => {
  it("are told apart by what would be saved, besides the body", () => {
    const saved = savedForm(EMPTY_TOPIC);
    assert.equal(savedForm({ ...EMPTY_TOPIC, body: { root: {} } }), saved);
    assert.notEqual(savedForm({ ...EMPTY_TOPIC, title: "TEST" }), saved);
    // An empty optional field is saved as no value, typed or not.
    assert.equal(savedForm({ ...EMPTY_TOPIC, changeNote: " " }), saved);
  });
});

describe("a save's answer", () => {
  const row = {
    individual: { id: "person", title: "TEST" },
    role: "subject" as const,
  };
  const sent = { ...EMPTY_TOPIC, title: "TEST", people: [row] };
  const stored = {
    ...sent,
    slug: "test",
    people: [{ ...row, id: "row-1" }],
  };

  it("is what the backend stored, when nothing changed meanwhile", () => {
    assert.equal(valuesAfterAnswer(sent, sent, stored), stored);
  });

  it("keeps what was typed meanwhile, with the new rows' ids", () => {
    const typed = {
      ...sent,
      summary: "TEST typed while saving",
      people: [{ ...row, role: "speaker" as const }],
    };
    const after = valuesAfterAnswer(typed, sent, stored);
    assert.equal(after.summary, "TEST typed while saving");
    assert.deepEqual(after.people, [{ ...row, role: "speaker", id: "row-1" }]);
    assert.notEqual(savedForm(after), savedForm(stored));
  });
});
