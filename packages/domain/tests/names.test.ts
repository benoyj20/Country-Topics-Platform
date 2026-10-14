import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  isHttpUrl,
  isSlug,
  isWikidataId,
  personNameKey,
  SLUG_MAX_LENGTH,
  slugify,
} from "../src/names.ts";

describe("slugify", () => {
  it("makes lowercase ASCII words joined by hyphens", () => {
    assert.equal(
      slugify("  Public Health & Safety!  "),
      "public-health-safety",
    );
    assert.equal(slugify("Côte d'Ivoire"), "cote-d-ivoire");
    assert.equal(slugify("Åland Islands"), "aland-islands");
    assert.equal(slugify("Straße Łódź Ærø"), "strasse-lodz-aero");
  });

  it("returns an empty slug for text with no Latin letters or digits", () => {
    assert.equal(slugify("中国"), "");
    assert.equal(slugify("---"), "");
  });

  it("cuts long slugs at a word boundary", () => {
    const slug = slugify("word ".repeat(40));
    assert.ok(slug.length <= SLUG_MAX_LENGTH);
    assert.ok(isSlug(slug));
    assert.ok(!slug.endsWith("-"));
  });
});

describe("isSlug", () => {
  it("accepts only what slugify produces", () => {
    assert.equal(isSlug("public-health"), true);
    assert.equal(isSlug("Public-Health"), false);
    assert.equal(isSlug("public--health"), false);
    assert.equal(isSlug("-public"), false);
    assert.equal(isSlug(""), false);
    assert.equal(isSlug("a".repeat(SLUG_MAX_LENGTH + 1)), false);
  });
});

describe("personNameKey", () => {
  it("ignores case, accents, punctuation, spacing, and word order", () => {
    const key = personNameKey("José  Pérez-Díaz");
    assert.equal(key, "diaz jose perez");
    assert.equal(personNameKey("DIAZ, Jose Perez"), key);
    assert.equal(personNameKey("pérez díaz josé."), key);
  });

  it("keeps names in other scripts", () => {
    assert.equal(personNameKey("Ἀθηνᾶ"), "αθηνα");
    assert.equal(personNameKey("李 明"), personNameKey("明 李"));
    assert.notEqual(personNameKey("李明"), "");
  });

  it("tells different names apart", () => {
    assert.notEqual(
      personNameKey("Test Person A"),
      personNameKey("Test Person B"),
    );
  });
});

describe("isWikidataId", () => {
  it("accepts item ids only", () => {
    assert.equal(isWikidataId("Q42"), true);
    assert.equal(isWikidataId("Q0"), false);
    assert.equal(isWikidataId("q42"), false);
    assert.equal(isWikidataId("P31"), false);
    assert.equal(isWikidataId("https://www.wikidata.org/wiki/Q42"), false);
  });
});

describe("isHttpUrl", () => {
  it("accepts absolute web links only", () => {
    assert.equal(isHttpUrl("https://example.org/profile"), true);
    assert.equal(isHttpUrl("http://example.org"), true);
    assert.equal(isHttpUrl("javascript:alert(1)"), false);
    assert.equal(isHttpUrl("data:text/html,hi"), false);
    assert.equal(isHttpUrl("/relative"), false);
    assert.equal(isHttpUrl("example.org"), false);
  });
});
