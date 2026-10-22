import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  browseHref,
  BROWSE_VALUES_MAX,
  browseSearchParams,
  EMPTY_BROWSE_QUERY,
  effectiveSort,
  filterCount,
  parseBrowseQuery,
} from "../src/index.ts";

const parse = (search: string) => parseBrowseQuery(new URLSearchParams(search));

describe("parseBrowseQuery", () => {
  it("reads every filter, the search words, and the sort", () => {
    const { query, problems } = parse(
      "q=  water   rights &country=kenya&country=ghana&category=health&tag=rivers" +
        "&person=test-person&evidence=snippet&language=pt-BR&references=1" +
        "&from=2026-01-01&to=2026-10-17&sort=referenced",
    );
    assert.deepEqual(problems, []);
    assert.deepEqual(query, {
      q: "water rights",
      country: ["ghana", "kenya"],
      category: ["health"],
      tag: ["rivers"],
      person: ["test-person"],
      evidence: ["snippet"],
      language: ["pt-br"],
      references: true,
      from: "2026-01-01",
      to: "2026-10-17",
      sort: "referenced",
    });
  });

  it("leaves out what is not valid and says why", () => {
    const { query, problems } = parse(
      "country=Kenya!&evidence=video&language=english&references=yes" +
        "&from=2026-02-30&sort=random&q=a&q=b",
    );
    assert.deepEqual(query, { ...EMPTY_BROWSE_QUERY, q: "a" });
    assert.deepEqual(problems, [
      '"q" was given more than once.',
      'Country: "Kenya!" is not valid.',
      'Evidence: "video" is not valid.',
      'Language: "english" is not valid.',
      '"references" must be 1 (topics that cite a reference).',
      '"from" must be a date such as 2026-10-17.',
      '"random" is not a way to sort.',
    ]);
  });

  it("refuses dates in the wrong order, long search words, and too many values", () => {
    const swapped = parse("from=2026-10-17&to=2026-01-01");
    assert.deepEqual(
      [swapped.query.from, swapped.query.to],
      ["2026-01-01", "2026-10-17"],
    );
    assert.deepEqual(swapped.problems, [
      '"from" was after "to", so the two dates were swapped.',
    ]);
    assert.equal(parse(`q=${"a".repeat(201)}`).problems.length, 1);
    const many = Array.from(
      { length: BROWSE_VALUES_MAX + 1 },
      (_, n) => `tag=tag-${n}`,
    ).join("&");
    const { query, problems } = parse(many);
    assert.deepEqual(problems, [`Tag: choose at most ${BROWSE_VALUES_MAX}.`]);
    assert.equal(query.tag.length, BROWSE_VALUES_MAX);
  });

  it("lists parameters it does not know, without reading them", () => {
    assert.deepEqual(parse("utm_source=mail&cursor=abc&utm_source=x"), {
      query: EMPTY_BROWSE_QUERY,
      problems: [],
      unknown: ["utm_source", "cursor"],
    });
  });

  it("reads language codes in lower case", () => {
    assert.deepEqual(parse("language=PT-br&language=pt-BR").query.language, [
      "pt-br",
    ]);
  });

  it("drops a sort that is already the default, or relevance without words", () => {
    assert.equal(parse("sort=newest").query.sort, null);
    assert.equal(parse("q=water&sort=relevance").query.sort, null);
    assert.equal(parse("sort=relevance").query.sort, null);
    assert.equal(parse("q=water&sort=newest").query.sort, "newest");
  });
});

describe("browseSearchParams", () => {
  it("gives one canonical form for equal requests", () => {
    const a = parse("tag=b&country=kenya&tag=a&tag=a&sort=newest").query;
    const b = parse("tag=a&tag=b&country=kenya").query;
    assert.equal(
      browseSearchParams(a).toString(),
      browseSearchParams(b).toString(),
    );
    assert.equal(browseSearchParams(a).toString(), "country=kenya&tag=a&tag=b");
  });

  it("reads back to the same request", () => {
    const search =
      "q=water+rights&country=ghana&country=kenya&person=test-person" +
      "&references=1&from=2026-01-01&sort=updated";
    assert.equal(browseSearchParams(parse(search).query).toString(), search);
  });
});

describe("helpers", () => {
  it("builds page addresses", () => {
    assert.equal(browseHref(), "/topics");
    assert.equal(browseHref({ country: ["kenya"] }), "/topics?country=kenya");
  });

  it("sorts by relevance only when there are words to rank", () => {
    assert.equal(
      effectiveSort({ ...EMPTY_BROWSE_QUERY, q: "water" }),
      "relevance",
    );
    assert.equal(effectiveSort(EMPTY_BROWSE_QUERY), "newest");
    assert.equal(
      effectiveSort({ ...EMPTY_BROWSE_QUERY, sort: "relevance" }),
      "newest",
    );
  });

  it("counts chosen filters, not the search words or sort", () => {
    assert.equal(
      filterCount({
        ...parse("country=kenya&tag=a&references=1&from=2026-01-01").query,
        q: "water",
      }),
      4,
    );
  });
});
