import { describe, expect, it } from "vitest";

import { readServerEnv } from "@/env";

const DATABASE_URL = "postgres://app:pw@localhost:5433/countrytopics";
const PAYLOAD_SECRET = "s".repeat(32);

describe("readServerEnv", () => {
  it("reads a valid configuration", () => {
    expect(readServerEnv({ DATABASE_URL, PAYLOAD_SECRET })).toEqual({
      databaseUrl: DATABASE_URL,
      databaseReplicaUrl: undefined,
      payloadSecret: PAYLOAD_SECRET,
    });
  });

  it("uses a replica only when it differs from the primary", () => {
    const replica = "postgresql://app:pw@replica:5432/countrytopics";

    expect(
      readServerEnv({
        DATABASE_URL,
        DATABASE_REPLICA_URL: DATABASE_URL,
        PAYLOAD_SECRET,
      }).databaseReplicaUrl,
    ).toBeUndefined();
    expect(
      readServerEnv({
        DATABASE_URL,
        DATABASE_REPLICA_URL: replica,
        PAYLOAD_SECRET,
      }).databaseReplicaUrl,
    ).toBe(replica);
  });

  it("lists every problem by variable name", () => {
    expect(() => readServerEnv({ DATABASE_REPLICA_URL: "mysql://x" })).toThrow(
      /DATABASE_URL must[\s\S]*DATABASE_REPLICA_URL must[\s\S]*PAYLOAD_SECRET must/,
    );
  });

  it("rejects a secret shorter than 32 characters without echoing it", () => {
    const shortSecret = "short-secret-value";

    expect(() =>
      readServerEnv({ DATABASE_URL, PAYLOAD_SECRET: shortSecret }),
    ).toThrow(/PAYLOAD_SECRET must be at least 32 characters/);
    expect(() =>
      readServerEnv({ DATABASE_URL, PAYLOAD_SECRET: shortSecret }),
    ).not.toThrow(shortSecret);
  });

  it("does not count surrounding whitespace toward the secret length", () => {
    expect(() =>
      readServerEnv({ DATABASE_URL, PAYLOAD_SECRET: `  ${"s".repeat(31)}  ` }),
    ).toThrow(/PAYLOAD_SECRET/);
  });
});
