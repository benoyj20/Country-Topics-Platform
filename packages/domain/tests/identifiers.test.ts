import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { normalizeDoi, normalizeIsbn } from "../src/identifiers.ts";

// Public samples: 10.1000/182 is the DOI of the DOI Handbook, and
// 0-306-40615-2 / 978-0-306-40615-7 are the worked example in the ISBN
// article on Wikipedia.

describe("normalizeDoi", () => {
  it("accepts bare DOIs, doi: prefixes, and doi.org links", () => {
    for (const input of [
      "10.1000/182",
      " doi:10.1000/182 ",
      "DOI: 10.1000/182",
      "https://doi.org/10.1000/182",
      "http://dx.doi.org/10.1000/182",
      "https://doi.org/10.1000%2F182",
    ]) {
      assert.equal(normalizeDoi(input), "10.1000/182", input);
    }
  });

  it("lowercases, because DOIs are case-insensitive", () => {
    assert.equal(normalizeDoi("10.1000/ABC.Def"), "10.1000/abc.def");
  });

  it("refuses what is not a DOI", () => {
    for (const input of [
      "",
      "10.1000",
      "10.12/short-prefix",
      "11.1000/182",
      "10.1000/has space",
      "https://example.org/10.1000/182",
      "https://doi.org/%E0%A4%A",
      "10.1234/../../works/10.1000/182",
      "10.1234/./x",
      `10.1000/${"a".repeat(300)}`,
    ]) {
      assert.equal(normalizeDoi(input), null, input);
    }
  });
});

describe("normalizeIsbn", () => {
  it("turns ISBN-10 and ISBN-13, with or without hyphens, into 13 digits", () => {
    for (const input of [
      "978-0-306-40615-7",
      "9780306406157",
      "0-306-40615-2",
      "0306406152",
      "ISBN 978 0 306 40615 7",
      "ISBN-10: 0-306-40615-2",
    ]) {
      assert.equal(normalizeIsbn(input), "9780306406157", input);
    }
  });

  it("accepts X as an ISBN-10 check digit", () => {
    // Synthetic: the weighted sum of 000000006 is 12, so the check is 10 (X).
    assert.equal(normalizeIsbn("000000006X"), "9780000000064");
    assert.equal(normalizeIsbn("000000006x"), "9780000000064");
  });

  it("refuses wrong check digits and other lengths", () => {
    for (const input of [
      "978-0-306-40615-8",
      "0-306-40615-3",
      "977-0-306-40615-7",
      "12345",
      "",
    ]) {
      assert.equal(normalizeIsbn(input), null, input);
    }
  });
});
