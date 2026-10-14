import config from "@payload-config";
import { getPayload, type Payload } from "payload";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { GET } from "@/app/(frontend)/api/v1/health/route";

const UUID_V7_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

let payload: Payload;

beforeAll(async () => {
  payload = await getPayload({ config });
});

afterAll(async () => {
  await payload.destroy();
});

describe("integration environment", () => {
  it("runs against the dedicated test database", () => {
    const databaseName = new URL(process.env.DATABASE_URL ?? "").pathname.slice(
      1,
    );
    expect(databaseName).toMatch(/_test$/);
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

describe("users collection", () => {
  it("stores staff users with time-ordered UUID primary keys", async () => {
    const user = await payload.create({
      collection: "users",
      data: {
        email: "admin@example.test",
        password: "correct-horse-battery-staple",
      },
    });

    try {
      expect(user.id).toMatch(UUID_V7_PATTERN);
      const found = await payload.find({
        collection: "users",
        where: { email: { equals: "admin@example.test" } },
      });
      expect(found.docs.map((doc) => doc.id)).toEqual([user.id]);
    } finally {
      await payload.delete({ collection: "users", id: user.id });
    }
  });
});
