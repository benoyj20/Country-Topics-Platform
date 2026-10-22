import { describe, expect, it } from "vitest";

import { changedFields, relationId } from "@/audit";

describe("changedFields", () => {
  it("compares arrays and objects by value", () => {
    const before = { aliases: ["A. Person"], links: [{ url: "https://a" }] };
    const after = { aliases: ["A. Person"], links: [{ url: "https://b" }] };

    expect(changedFields(before, after, ["aliases", "links"])).toEqual({
      links: { from: [{ url: "https://a" }], to: [{ url: "https://b" }] },
    });
  });

  it("treats missing and null as the same", () => {
    expect(changedFields({ bio: null }, {}, ["bio"])).toEqual({});
    expect(changedFields({}, { bio: "Text" }, ["bio"])).toEqual({
      bio: { from: null, to: "Text" },
    });
  });
});

describe("relationId", () => {
  it("reads the id whether or not the relation was loaded", () => {
    expect(relationId("0192")).toBe("0192");
    expect(relationId({ id: "0192", name: "Kenya" })).toBe("0192");
    expect(relationId(null)).toBeNull();
  });
});
