import { describe, expect, it } from "vitest";

import {
  browseHref,
  BROWSE_VALUES_MAX,
  browseSearchParams,
  EMPTY_BROWSE_QUERY,
  effectiveSort,
  filterCount,
  parseBrowseQuery,
} from "@/public/browse-query";

const parse = (search: string) => parseBrowseQuery(new URLSearchParams(search));

describe("parseBrowseQuery", () => {
  it("reads every filter, the search words, and the sort", () => {
    const { query, problems } = parse(
      "q=  water   rights &country=kenya&country=ghana&category=health&tag=rivers" +
        "&person=test-person&evidence=snippet&language=pt-BR&references=1" +
        "&from=2026-01-01&to=2026-10-17&sort=referenced",
    );
    expect(problems).toEqual([]);
    expect(query).toEqual({
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
    expect(query).toEqual({ ...EMPTY_BROWSE_QUERY, q: "a" });
    expect(problems).toEqual([
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
    expect(parse("from=2026-10-17&to=2026-01-01")).toMatchObject({
      query: { from: "2026-01-01", to: "2026-10-17" },
      problems: ['"from" was after "to", so the two dates were swapped.'],
    });
    expect(parse(`q=${"a".repeat(201)}`).problems).toHaveLength(1);
    const many = Array.from(
      { length: BROWSE_VALUES_MAX + 1 },
      (_, n) => `tag=tag-${n}`,
    ).join("&");
    const { query, problems } = parse(many);
    expect(problems).toEqual([`Tag: choose at most ${BROWSE_VALUES_MAX}.`]);
    expect(query.tag).toHaveLength(BROWSE_VALUES_MAX);
  });

  it("lists parameters it does not know, without reading them", () => {
    expect(parse("utm_source=mail&cursor=abc&utm_source=x")).toEqual({
      query: EMPTY_BROWSE_QUERY,
      problems: [],
      unknown: ["utm_source", "cursor"],
    });
  });

  it("reads language codes in lower case", () => {
    expect(parse("language=PT-br&language=pt-BR").query.language).toEqual([
      "pt-br",
    ]);
  });

  it("drops a sort that is already the default, or relevance without words", () => {
    expect(parse("sort=newest").query.sort).toBeNull();
    expect(parse("q=water&sort=relevance").query.sort).toBeNull();
    expect(parse("sort=relevance").query.sort).toBeNull();
    expect(parse("q=water&sort=newest").query.sort).toBe("newest");
  });
});

describe("browseSearchParams", () => {
  it("gives one canonical form for equal requests", () => {
    const a = parse("tag=b&country=kenya&tag=a&tag=a&sort=newest").query;
    const b = parse("tag=a&tag=b&country=kenya").query;
    expect(browseSearchParams(a).toString()).toBe(
      browseSearchParams(b).toString(),
    );
    expect(browseSearchParams(a).toString()).toBe("country=kenya&tag=a&tag=b");
  });

  it("reads back to the same request", () => {
    const search =
      "q=water+rights&country=ghana&country=kenya&person=test-person" +
      "&references=1&from=2026-01-01&sort=updated";
    expect(browseSearchParams(parse(search).query).toString()).toBe(search);
  });
});

describe("helpers", () => {
  it("builds page addresses", () => {
    expect(browseHref()).toBe("/topics");
    expect(browseHref({ country: ["kenya"] })).toBe("/topics?country=kenya");
  });

  it("sorts by relevance only when there are words to rank", () => {
    expect(effectiveSort({ ...EMPTY_BROWSE_QUERY, q: "water" })).toBe(
      "relevance",
    );
    expect(effectiveSort(EMPTY_BROWSE_QUERY)).toBe("newest");
    expect(effectiveSort({ ...EMPTY_BROWSE_QUERY, sort: "relevance" })).toBe(
      "newest",
    );
  });

  it("counts chosen filters, not the search words or sort", () => {
    expect(
      filterCount({
        ...parse("country=kenya&tag=a&references=1&from=2026-01-01").query,
        q: "water",
      }),
    ).toBe(4);
  });
});
