import { describe, expect, it } from "vitest";

import { profileLinks } from "@/public/profile-links";

describe("profileLinks", () => {
  it("adds the Wikidata item after the admin's links", () => {
    expect(
      profileLinks(
        [{ label: "Official page", url: "https://example.org/" }],
        "Q42",
      ),
    ).toEqual([
      { label: "Official page", url: "https://example.org/" },
      { label: "Wikidata", url: "https://www.wikidata.org/wiki/Q42" },
    ]);
  });

  it("does not repeat the Wikidata item when a link already goes there", () => {
    const links = [
      { label: "Wikidata", url: "https://wikidata.org/wiki/Q42/" },
      { label: "Wikipedia", url: "https://en.wikipedia.org/wiki/Example" },
    ];
    expect(profileLinks(links, "Q42")).toEqual(links);
  });

  it("lists each address once, keeping the first label", () => {
    expect(
      profileLinks(
        [
          { label: "Site", url: "https://example.org/about" },
          { label: "Same site", url: "https://www.example.org/about/" },
        ],
        null,
      ),
    ).toEqual([{ label: "Site", url: "https://example.org/about" }]);
  });
});
