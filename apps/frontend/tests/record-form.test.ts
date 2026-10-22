import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { EVIDENCE_TEXTS, sourceTexts } from "../src/admin/evidence-text.ts";
import {
  fieldNameAt,
  fieldProps,
  type FieldTexts,
  rowNameAt,
  textAt,
} from "../src/admin/field-text.ts";
import {
  patchRow,
  valuesAfterAnswer,
  withRowIds,
} from "../src/admin/form-state.ts";

// The record editors' forms (src/admin/records): fields named by their
// path, however deep in rows, and what a save's answer keeps.

const TEXTS: FieldTexts = {
  name: { label: "Name", description: "The name the person is best known by." },
  statements: {
    label: "Statements",
    row: "Statement",
    fields: {
      text: { label: "Statement" },
      evidence: { label: "Evidence", row: "Evidence", fields: EVIDENCE_TEXTS },
      sources: {
        label: "Sources",
        row: "Source",
        fields: sourceTexts("TEST passage description."),
      },
    },
  },
};

describe("a field's text", () => {
  it("is found by its path, in rows of rows", () => {
    assert.equal(textAt(TEXTS, "name")?.label, "Name");
    assert.equal(
      textAt(TEXTS, "statements.0.evidence.1.url")?.label,
      EVIDENCE_TEXTS.url?.label,
    );
    assert.equal(
      textAt(TEXTS, "statements.3.sources.0.passage")?.description,
      "TEST passage description.",
    );
    assert.equal(textAt(TEXTS, "missing.0.field"), undefined);
  });

  it("names the rows a field is in", () => {
    assert.equal(
      fieldNameAt(TEXTS, "statements.0.evidence.1.url"),
      "Statement 1, Evidence 2, Link",
    );
    assert.equal(
      fieldNameAt(TEXTS, "statements.1.sources"),
      "Statement 2, Sources",
    );
    assert.equal(fieldNameAt(TEXTS, "unknown"), "unknown");
    assert.equal(rowNameAt(TEXTS, "statements.0.evidence"), "Evidence");
  });

  it("gives the field its messages and what describes it", () => {
    const refusal = {
      fields: { name: ["This field is required."] },
      general: [],
    };
    const field = fieldProps(TEXTS, "name", refusal);
    assert.deepEqual(field.messages, ["This field is required."]);
    assert.equal(field.aria["aria-invalid"], true);
    assert.equal(field.aria["aria-describedby"], "name-description name-error");
    assert.equal(
      fieldProps(TEXTS, "name", null).aria["aria-invalid"],
      undefined,
    );
  });
});

describe("a save's answer to a record form", () => {
  type Values = {
    name: string;
    statements: {
      id?: string;
      text: string;
      evidence: { id?: string; title: string }[];
    }[];
  };
  const statement = { text: "TEST statement", evidence: [{ title: "TEST" }] };
  const sent: Values = { name: "TEST", statements: [statement] };
  const stored: Values = {
    name: "TEST",
    statements: [
      { ...statement, id: "s1", evidence: [{ title: "TEST", id: "e1" }] },
    ],
  };
  const saved = (values: Values) => JSON.stringify(values);

  it("is what the backend stored, when nothing changed meanwhile", () => {
    assert.equal(valuesAfterAnswer(sent, sent, stored, saved), stored);
  });

  it("keeps what was typed meanwhile, with new rows' ids however deep", () => {
    const typed: Values = {
      name: "TEST typed while saving",
      statements: [
        {
          ...statement,
          evidence: [{ title: "TEST changed" }, { title: "TEST new" }],
        },
      ],
    };
    const after = valuesAfterAnswer(typed, sent, stored, saved);
    assert.equal(after.name, "TEST typed while saving");
    assert.equal(after.statements[0]?.id, "s1");
    // The evidence rows were added to, so none is matched by place.
    assert.deepEqual(after.statements[0]?.evidence, [
      { title: "TEST changed" },
      { title: "TEST new" },
    ]);
  });

  it("matches a row edited in place to the one saved there", () => {
    const typed: Values = {
      ...sent,
      statements: [{ ...statement, evidence: [{ title: "TEST edited" }] }],
    };
    assert.deepEqual(withRowIds(typed, sent, stored).statements, [
      {
        ...statement,
        id: "s1",
        evidence: [{ title: "TEST edited", id: "e1" }],
      },
    ]);
  });

  it("matches a saved row by its id, wherever it moved", () => {
    const a = { id: "a", text: "TEST A", evidence: [{ title: "TEST eA" }] };
    const b = { id: "b", text: "TEST B", evidence: [{ title: "TEST eB" }] };
    const sentRows: Values = { name: "TEST", statements: [a, b] };
    const storedRows: Values = {
      name: "TEST",
      statements: [
        { ...a, evidence: [{ title: "TEST eA", id: "eA" }] },
        { ...b, evidence: [{ title: "TEST eB", id: "eB" }] },
      ],
    };
    // B moved up and was edited while the save ran.
    const typed: Values = {
      name: "TEST",
      statements: [{ ...b, text: "TEST B edited" }, a],
    };
    const after = withRowIds(typed, sentRows, storedRows);
    assert.deepEqual(
      after.statements.map((row) => [row.id, row.evidence[0]?.id]),
      [
        ["b", "eB"],
        ["a", "eA"],
      ],
    );
  });

  it("patches one row", () => {
    assert.deepEqual(patchRow([{ a: 1 }, { a: 2 }], 1, { a: 3 }), [
      { a: 1 },
      { a: 3 },
    ]);
  });
});
