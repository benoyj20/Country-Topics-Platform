import { describe, expect, it } from "vitest";

import { testDatabaseUrl } from "../int/test-database";

describe("testDatabaseUrl", () => {
  it("accepts a database whose name ends in _test", () => {
    const url =
      "postgres://app:pw@localhost:5433/countrytopics_test?sslmode=disable";

    expect(testDatabaseUrl({ TEST_DATABASE_URL: url })).toBe(url);
  });

  it("refuses the development database so tests never wipe it", () => {
    expect(() =>
      testDatabaseUrl({
        TEST_DATABASE_URL: "postgres://app:pw@localhost:5433/countrytopics",
      }),
    ).toThrow(/ending in _test/);
  });

  it("explains how to fix a missing or invalid value", () => {
    expect(() => testDatabaseUrl({})).toThrow(/make env/);
    expect(() => testDatabaseUrl({ TEST_DATABASE_URL: "not a url" })).toThrow(
      /not a valid/,
    );
  });
});
