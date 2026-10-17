import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  evidenceProblems,
  referenceCheckResult,
  statementIsBacked,
  type SnippetEvidence,
  type TopicEvidence,
} from "../src/topic-evidence.ts";

const topic = (overrides: Partial<TopicEvidence>): TopicEvidence => ({
  namesIndividuals: false,
  evidenceCount: 0,
  references: [],
  snippets: [],
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

  it("needs each snippet's video confirmed playable once, and the clip inside it", () => {
    const video = (
      overrides: Partial<NonNullable<SnippetEvidence["video"]>>,
    ) => ({
      checkStatus: "playable" as const,
      confirmed: true,
      duration_s: 60,
      ...overrides,
    });
    const problems = evidenceProblems(
      topic({
        snippets: [
          { caption: "Fine", end_s: 60.9, video: video({}) },
          // Confirmed once, then removed: the transcript still stands.
          {
            caption: "Removed later",
            end_s: 30,
            video: video({ checkStatus: "unavailable" }),
          },
          {
            caption: "Waiting",
            end_s: 30,
            video: video({ checkStatus: "pending", confirmed: false }),
          },
          {
            caption: "Private",
            end_s: 30,
            video: video({ checkStatus: "unavailable", confirmed: false }),
          },
          {
            caption: "No embedding",
            end_s: 30,
            video: video({ checkStatus: "not_embeddable", confirmed: false }),
          },
          { caption: "Too long", end_s: 61.1, video: video({}) },
          { caption: "Gone", end_s: 30, video: null },
        ],
      }),
    );
    assert.deepEqual(
      problems.map((problem) => problem.field),
      ["evidence"],
    );
    const message = problems[0]?.message ?? "";
    assert.doesNotMatch(message, /Fine|Removed later/);
    assert.match(message, /"Waiting" \(its video is still being checked\)/);
    assert.match(
      message,
      /"Private" \(its video was not found, or is private\)/,
    );
    assert.match(message, /"No embedding" \(its video cannot be played/);
    assert.match(
      message,
      /"Too long" \(it ends after the video, which is 1:00 long\)/,
    );
    assert.match(message, /"Gone" \(its video is missing\)/);
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

describe("statementIsBacked", () => {
  const confirmed = { title: "R", checkStatus: "resolved" as const };
  const statement = (overrides: Partial<TopicEvidence>) => ({
    evidenceCount: 1,
    references: [confirmed],
    snippets: [],
    ...overrides,
  });

  it("needs evidence and a reference, every reference confirmed", () => {
    assert.equal(statementIsBacked(statement({})), true);
    assert.equal(statementIsBacked(statement({ evidenceCount: 0 })), false);
    assert.equal(statementIsBacked(statement({ references: [] })), false);
    assert.equal(
      statementIsBacked(
        statement({
          references: [confirmed, { title: "S", checkStatus: "pending" }],
        }),
      ),
      false,
    );
  });

  it("needs every snippet's video to have been found playable", () => {
    const snippet = (confirmedVideo: boolean): SnippetEvidence => ({
      caption: "C",
      end_s: 10,
      video: {
        checkStatus: confirmedVideo ? "playable" : "pending",
        confirmed: confirmedVideo,
        duration_s: 60,
      },
    });
    assert.equal(
      statementIsBacked(statement({ snippets: [snippet(true)] })),
      true,
    );
    assert.equal(
      statementIsBacked(statement({ snippets: [snippet(false)] })),
      false,
    );
  });
});
