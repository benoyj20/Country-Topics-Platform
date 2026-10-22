import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  EMPTY_INDIVIDUAL,
  EMPTY_REFERENCE,
  EMPTY_SNIPPET,
  editorMedia,
  fieldOfTree,
  fileOf,
  individualFieldOf,
  individualSaveBody,
  mediaFilePath,
  possibleDuplicatesSearchParams,
  referenceAfterLookup,
  snippetSaveBody,
  storedMediaSchema,
  termSaveBody,
} from "../src/index.ts";

// The record editors' contracts (ADR 0014, phase 9). The backend's
// integration test (apps/web/tests/int/admin-records.test.ts) sends these
// requests; these check the parts it cannot see.

const NOW = "2026-10-22T10:00:00.000Z";

describe("a refusal's path", () => {
  const tree = {
    name: true,
    statements: {
      text: true,
      evidence: { url: true },
    },
  } as const;

  it("names a field, however deep in rows", () => {
    assert.equal(fieldOfTree(tree, "name"), "name");
    assert.equal(fieldOfTree(tree, "statements.0.text"), "statements.0.text");
    assert.equal(
      fieldOfTree(tree, "statements.2.evidence.10.url"),
      "statements.2.evidence.10.url",
    );
  });

  it("names the array for a message about it or one of its rows", () => {
    assert.equal(fieldOfTree(tree, "statements"), "statements");
    assert.equal(fieldOfTree(tree, "statements.1"), "statements");
    assert.equal(
      fieldOfTree(tree, "statements.1.evidence"),
      "statements.1.evidence",
    );
    assert.equal(
      fieldOfTree(tree, "statements.1.evidence.0"),
      "statements.1.evidence",
    );
  });

  it("names nothing the form does not show", () => {
    for (const path of [
      "nameKey",
      "name.0",
      "statements.x.text",
      "statements.0.hidden",
      "statements.0.evidence.0.url.more",
      "",
    ]) {
      assert.equal(fieldOfTree(tree, path), null, path);
    }
    assert.equal(individualFieldOf("aliases.3.key"), null);
    assert.equal(individualFieldOf("notADuplicate"), "notADuplicate");
  });
});

describe("a stored file's address", () => {
  it("is this site's path, wherever Payload says it is", () => {
    assert.equal(
      mediaFilePath("http://localhost:3002/api/media/file/TEST%20a.png"),
      "/api/media/file/TEST%20a.png",
    );
    assert.equal(
      mediaFilePath("/api/media/file/TEST.pdf?v=2"),
      "/api/media/file/TEST.pdf?v=2",
    );
  });

  it("is nothing for any other address", () => {
    for (const url of [
      "https://example.org/a.png",
      "/api/users/me",
      "/api/media/file/../../users",
      "javascript:alert(1)",
      "",
      null,
    ]) {
      assert.equal(mediaFilePath(url), null, String(url));
    }
  });

  it("is the one a file's editor and its pickers link", () => {
    const stored = storedMediaSchema.parse({
      id: "TEST",
      url: "http://localhost:3002/api/media/file/TEST.png",
      createdAt: NOW,
      updatedAt: NOW,
    });
    assert.equal(editorMedia(stored).file.url, "/api/media/file/TEST.png");
    assert.equal(
      fileOf({ id: "TEST", url: "http://localhost:3002/api/media/file/T.png" })
        .url,
      "/api/media/file/T.png",
    );
  });
});

describe("a save's body", () => {
  it("sends empty optional text as none", () => {
    assert.deepEqual(
      termSaveBody("categories", { name: "TEST", description: " ", slug: "" }),
      { name: "TEST", description: null, slug: "" },
    );
    // Tags have no description.
    assert.deepEqual(
      termSaveBody("tags", { name: "TEST", description: "x", slug: " t " }),
      { name: "TEST", slug: "t" },
    );
    assert.equal(snippetSaveBody(EMPTY_SNIPPET).transcriptText, null);
  });

  it("says an individual is another person only when the box is ticked", () => {
    assert.equal(
      "notADuplicate" in individualSaveBody(EMPTY_INDIVIDUAL),
      false,
    );
    assert.equal(
      individualSaveBody({ ...EMPTY_INDIVIDUAL, notADuplicate: true })
        .notADuplicate,
      true,
    );
  });
});

describe("the duplicate warning's question", () => {
  it("asks about the names typed, and a Wikidata ID only once it is one", () => {
    const params = possibleDuplicatesSearchParams({
      name: "TEST Person",
      aliases: ["TEST Alias", " "],
      wikidataId: "Q4",
      exclude: "TEST-id",
    });
    assert.equal(
      params.toString(),
      "name=TEST+Person&alias=TEST+Alias&wikidataId=Q4&exclude=TEST-id",
    );
    assert.equal(
      possibleDuplicatesSearchParams({
        name: "TEST",
        aliases: [],
        wikidataId: "42",
        exclude: null,
      }).has("wikidataId"),
      false,
    );
  });
});

describe("a reference's lookup", () => {
  const found = {
    found: true as const,
    doi: "10.5555/test",
    isbn: null,
    metadata: {
      source: "Crossref",
      kind: "book" as const,
      title: "TEST title from the registry",
      authors: ["TEST One", "TEST Two"],
      publisher: "TEST Publisher",
    },
  };

  it("fills the empty fields and the identifier as it will be saved", () => {
    const { values, filled } = referenceAfterLookup(
      { ...EMPTY_REFERENCE, doi: "https://doi.org/10.5555/TEST" },
      found,
    );
    assert.equal(values.doi, "10.5555/test");
    assert.equal(values.title, "TEST title from the registry");
    assert.equal(values.authors, "TEST One\nTEST Two");
    assert.equal(values.kind, "book");
    assert.deepEqual(filled, ["title", "authors", "publisher"]);
  });

  it("never replaces what was typed, nor the kind once there is a title", () => {
    const typed = {
      ...EMPTY_REFERENCE,
      doi: "10.5555/test",
      kind: "report" as const,
      title: "TEST typed title",
      publisher: "TEST typed publisher",
    };
    const { values, filled } = referenceAfterLookup(typed, found);
    assert.equal(values.title, "TEST typed title");
    assert.equal(values.publisher, "TEST typed publisher");
    assert.equal(values.kind, "report");
    assert.deepEqual(filled, ["authors"]);
  });
});
