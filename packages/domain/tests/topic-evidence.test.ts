import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  evidenceProblems,
  referenceCheckResult,
  type TopicEvidence,
} from "../src/topic-evidence.ts";

const topic = (overrides: Partial<TopicEvidence>): TopicEvidence => ({
  namesIndividuals: false,
  evidenceCount: 0,
  references: [],
  ...overrides,
});

describe("evidenceProblems", () => {
  it("lets a topic that names nobody publish without evidence", () => {
    assert.deepEqual(evidenceProblems(topic({})), []);
  });

  it("needs evidence and a reference when the topic names individuals", () => {
    const problems = evidenceProblems(topic({ namesIndividuals: true }));
    assert.deepEqual(
      problems.map((problem) => problem.field),
      ["evidence", "references"],
    );
    assert.deepEqual(
      evidenceProblems(
        topic({
          namesIndividuals: true,
          evidenceCount: 1,
          references: [{ title: "Report", checkStatus: "resolved" }],
        }),
      ),
      [],
    );
  });

  it("needs every cited reference confirmed, saying why each is not", () => {
    const problems = evidenceProblems(
      topic({
        references: [
          { title: "Confirmed", checkStatus: "resolved" },
          { title: "Waiting", checkStatus: "pending" },
          { title: "Typo", checkStatus: "not_found" },
          { title: "Offline", checkStatus: "failed" },
          { title: "Unknown", checkStatus: null },
        ],
      }),
    );
    assert.equal(problems.length, 1);
    const [problem] = problems;
    assert.equal(problem?.field, "references");
    assert.match(problem?.message ?? "", /"Waiting" \(still being checked\)/);
    assert.match(problem?.message ?? "", /"Typo" \(its DOI, ISBN, or link/);
    assert.match(problem?.message ?? "", /"Offline" \(the check could not/);
    assert.match(problem?.message ?? "", /"Unknown" \(still being checked\)/);
    assert.doesNotMatch(problem?.message ?? "", /Confirmed/);
  });
});

describe("referenceCheckResult", () => {
  it("is resolved only when every identifier resolves", () => {
    assert.equal(
      referenceCheckResult([
        { identifier: "doi", outcome: "resolved" },
        { identifier: "url", outcome: "resolved" },
      ]).status,
      "resolved",
    );
  });

  it("puts not found ahead of a check that could not finish", () => {
    const result = referenceCheckResult([
      { identifier: "doi", outcome: "failed", message: "Crossref timed out." },
      { identifier: "isbn", outcome: "not_found", message: "Unknown ISBN." },
    ]);
    assert.deepEqual(result, {
      status: "not_found",
      message: "ISBN: Unknown ISBN.",
    });
    assert.deepEqual(
      referenceCheckResult([
        { identifier: "url", outcome: "resolved" },
        { identifier: "doi", outcome: "failed" },
      ]),
      { status: "failed", message: "DOI: failed" },
    );
  });

  it("treats a reference with nothing to check as not found", () => {
    assert.equal(referenceCheckResult([]).status, "not_found");
  });
});
