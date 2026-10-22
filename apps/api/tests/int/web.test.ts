import { describe, expect, it } from "vitest";

import { GET } from "@/app/api/v1/health/route";

import { testDatabaseUrl } from "./test-database";

describe("integration environment", () => {
  it("runs against the dedicated test database", () => {
    expect(() =>
      testDatabaseUrl({ TEST_DATABASE_URL: process.env.DATABASE_URL }),
    ).not.toThrow();
  });
});

describe("GET /api/v1/health", () => {
  it("reports ok when the database answers, and is never cached", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ status: "ok" });
  });
});
