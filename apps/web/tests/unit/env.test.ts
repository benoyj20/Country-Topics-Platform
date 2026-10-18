import { describe, expect, it } from "vitest";

import { readServerEnv } from "@/env";

const DATABASE_URL = "postgres://app:pw@localhost:5433/countrytopics";
const valid = {
  DATABASE_URL,
  PAYLOAD_SECRET: "p".repeat(32),
  BETTER_AUTH_SECRET: "b".repeat(32),
  SITE_URL: "http://localhost:3000",
  REDIS_URL: "redis://localhost:6379",
  S3_BUCKET: "countrytopics",
  S3_ACCESS_KEY_ID: "access-key",
  S3_SECRET_ACCESS_KEY: "secret-key",
};

describe("readServerEnv", () => {
  it("reads a minimal valid configuration with safe defaults", () => {
    expect(readServerEnv(valid)).toEqual({
      databaseUrl: DATABASE_URL,
      databaseReplicaUrl: undefined,
      payloadSecret: valid.PAYLOAD_SECRET,
      siteUrl: "http://localhost:3000",
      betterAuthSecret: valid.BETTER_AUTH_SECRET,
      google: undefined,
      adminEmails: [],
      inviteOnly: true,
      redisUrl: valid.REDIS_URL,
      queuePrefix: "countrytopics",
      storage: {
        endpoint: undefined,
        region: "us-east-1",
        bucket: "countrytopics",
        accessKeyId: "access-key",
        secretAccessKey: "secret-key",
      },
      contactEmail: undefined,
      siteOperator: undefined,
      googleBooksApiKey: undefined,
      turnstile: undefined,
      clientIpHeader: undefined,
    });
    expect(
      readServerEnv({ ...valid, GOOGLE_BOOKS_API_KEY: " key " })
        .googleBooksApiKey,
    ).toBe("key");
  });

  it("reads an S3-compatible endpoint and refuses bad storage settings", () => {
    expect(
      readServerEnv({
        ...valid,
        S3_ENDPOINT: "http://localhost:8333",
        S3_REGION: "auto",
      }).storage,
    ).toMatchObject({ endpoint: "http://localhost:8333", region: "auto" });
    expect(() =>
      readServerEnv({ ...valid, S3_ENDPOINT: "localhost:8333" }),
    ).toThrow(/S3_ENDPOINT must/);
    expect(() => readServerEnv({ ...valid, S3_BUCKET: "Bad_Bucket" })).toThrow(
      /S3_BUCKET must/,
    );
    expect(() => readServerEnv({ ...valid, S3_SECRET_ACCESS_KEY: "" })).toThrow(
      /S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY must be set/,
    );
    expect(() =>
      readServerEnv({ ...valid, CONTACT_EMAIL: "not an address" }),
    ).toThrow(/CONTACT_EMAIL/);
  });

  it("reads who runs the site, within a length limit", () => {
    expect(
      readServerEnv({ ...valid, SITE_OPERATOR: " TEST Operator " })
        .siteOperator,
    ).toBe("TEST Operator");
    expect(() =>
      readServerEnv({ ...valid, SITE_OPERATOR: "x".repeat(201) }),
    ).toThrow(/SITE_OPERATOR must be at most 200/);
  });

  it("turns Turnstile on with both keys and reads the client address header", () => {
    expect(
      readServerEnv({
        ...valid,
        TURNSTILE_SITE_KEY: " site ",
        TURNSTILE_SECRET_KEY: "secret",
        CLIENT_IP_HEADER: "CF-Connecting-IP",
      }),
    ).toMatchObject({
      turnstile: { siteKey: "site", secretKey: "secret" },
      clientIpHeader: "cf-connecting-ip",
    });
    expect(() =>
      readServerEnv({ ...valid, TURNSTILE_SITE_KEY: "site" }),
    ).toThrow(/TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY/);
    expect(() =>
      readServerEnv({ ...valid, CLIENT_IP_HEADER: "x-real-ip: 1.2.3.4" }),
    ).toThrow(/CLIENT_IP_HEADER/);
    // Cloudflare's always-pass test keys, only on localhost.
    const testKeys = {
      TURNSTILE_SITE_KEY: "1x00000000000000000000AA",
      TURNSTILE_SECRET_KEY: "1x0000000000000000000000000000000AA",
    };
    expect(readServerEnv({ ...valid, ...testKeys }).turnstile).toBeDefined();
    expect(() =>
      readServerEnv({
        ...valid,
        ...testKeys,
        SITE_URL: "https://countrytopics.example",
      }),
    ).toThrow(/test keys/);
  });

  it("uses a replica only when it differs from the primary", () => {
    const replica = "postgresql://app:pw@replica:5432/countrytopics";

    expect(
      readServerEnv({ ...valid, DATABASE_REPLICA_URL: DATABASE_URL })
        .databaseReplicaUrl,
    ).toBeUndefined();
    expect(
      readServerEnv({ ...valid, DATABASE_REPLICA_URL: replica })
        .databaseReplicaUrl,
    ).toBe(replica);
  });

  it("lists every problem by variable name", () => {
    expect(() => readServerEnv({ DATABASE_REPLICA_URL: "mysql://x" })).toThrow(
      /DATABASE_URL must[\s\S]*DATABASE_REPLICA_URL must[\s\S]*PAYLOAD_SECRET must[\s\S]*SITE_URL must[\s\S]*BETTER_AUTH_SECRET must[\s\S]*REDIS_URL must[\s\S]*S3_BUCKET must/,
    );
  });

  it("rejects short secrets without echoing them", () => {
    const shortSecret = "short-secret-value";

    expect(() =>
      readServerEnv({ ...valid, BETTER_AUTH_SECRET: shortSecret }),
    ).toThrow(/BETTER_AUTH_SECRET must be at least 32 characters/);
    expect(() =>
      readServerEnv({ ...valid, BETTER_AUTH_SECRET: shortSecret }),
    ).not.toThrow(shortSecret);
  });

  it("does not count surrounding whitespace toward a secret's length", () => {
    expect(() =>
      readServerEnv({ ...valid, PAYLOAD_SECRET: `  ${"s".repeat(31)}  ` }),
    ).toThrow(/PAYLOAD_SECRET/);
  });

  it("normalises the site URL to its origin and rejects paths", () => {
    expect(
      readServerEnv({ ...valid, SITE_URL: "https://topics.example/" }).siteUrl,
    ).toBe("https://topics.example");
    expect(() =>
      readServerEnv({ ...valid, SITE_URL: "https://topics.example/app" }),
    ).toThrow(/SITE_URL/);
  });

  it("needs both Google values or neither", () => {
    expect(
      readServerEnv({
        ...valid,
        GOOGLE_CLIENT_ID: "id",
        GOOGLE_CLIENT_SECRET: "secret",
      }).google,
    ).toEqual({ clientId: "id", clientSecret: "secret" });
    expect(() => readServerEnv({ ...valid, GOOGLE_CLIENT_ID: "id" })).toThrow(
      /GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET/,
    );
  });

  it("normalises admin emails and parses the invite-only flag", () => {
    const env = readServerEnv({
      ...valid,
      ADMIN_EMAILS: " Owner@Example.test, ,second@example.test ",
      INVITE_ONLY: "FALSE",
    });

    expect(env.adminEmails).toEqual([
      "owner@example.test",
      "second@example.test",
    ]);
    expect(env.inviteOnly).toBe(false);
    expect(() => readServerEnv({ ...valid, INVITE_ONLY: "yes" })).toThrow(
      /INVITE_ONLY/,
    );
    expect(() =>
      readServerEnv({ ...valid, ADMIN_EMAILS: "not-an-email" }),
    ).toThrow(/ADMIN_EMAILS/);
  });
});
