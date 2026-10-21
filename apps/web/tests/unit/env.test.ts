import { describe, expect, it } from "vitest";

import { readServerEnv } from "@/env";

const DATABASE_URL = "postgres://app:pw@localhost:5433/countrytopics";
const valid = {
  DATABASE_URL,
  PAYLOAD_SECRET: "p".repeat(32),
  BETTER_AUTH_SECRET: "b".repeat(32),
  SITE_URL: "http://localhost:3000",
  BACKEND_URL: "http://localhost:3002",
  FORWARDING_KEY: "f".repeat(32),
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
      backendUrl: "http://localhost:3002",
      // Payload's panel, at the backend's own address, locally only.
      panelOrigin: "http://localhost:3002",
      forwardingKey: valid.FORWARDING_KEY,
      betterAuthSecret: valid.BETTER_AUTH_SECRET,
      google: undefined,
      adminEmails: [],
      inviteOnly: true,
      redisUrl: valid.REDIS_URL,
      pageCacheUrl: undefined,
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
      errorReporting: undefined,
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

  it("reads the page cache's own Valkey", () => {
    expect(
      readServerEnv({ ...valid, PAGE_CACHE_URL: "redis://cache:6379" })
        .pageCacheUrl,
    ).toBe("redis://cache:6379");
    expect(() =>
      readServerEnv({ ...valid, PAGE_CACHE_URL: "http://cache" }),
    ).toThrow(/PAGE_CACHE_URL must be empty or a redis/);
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

  it("turns Turnstile on with both keys", () => {
    expect(
      readServerEnv({
        ...valid,
        TURNSTILE_SITE_KEY: " site ",
        TURNSTILE_SECRET_KEY: "secret",
      }),
    ).toMatchObject({ turnstile: { siteKey: "site", secretKey: "secret" } });
    expect(() =>
      readServerEnv({ ...valid, TURNSTILE_SITE_KEY: "site" }),
    ).toThrow(/TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY/);
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
        SITE_URL: "https://name.trycloudflare.com",
      }),
    ).toThrow(/test keys/);
  });

  it("refuses to start with another environment's addresses", () => {
    const hosted = {
      ...valid,
      DATABASE_URL: "postgres://app:pw@db.example.org:5432/countrytopics",
      REDIS_URL: "redis://redis:6379",
      S3_ENDPOINT: "https://storage.example.org",
      BACKEND_URL: "https://api.countrytopics.example",
    };
    const production = readServerEnv({
      ...hosted,
      APP_ENV: "production",
      SITE_URL: "https://countrytopics.example",
      SENTRY_DSN: "https://key@o1.ingest.us.sentry.io/2",
    });
    // Errors are labelled with the environment unless SENTRY_ENVIRONMENT says otherwise.
    expect(production.errorReporting?.environment).toBe("production");
    expect(() =>
      readServerEnv({
        ...hosted,
        APP_ENV: "staging",
        SITE_URL: "https://dev.countrytopics.example",
      }),
    ).not.toThrow();
    // A demo of the local site through a quick tunnel.
    expect(
      readServerEnv({
        ...valid,
        SITE_URL: "https://premier-trying-strike-amd.trycloudflare.com",
      }).siteUrl,
    ).toBe("https://premier-trying-strike-amd.trycloudflare.com");

    expect(() =>
      readServerEnv({ ...valid, SITE_URL: "https://countrytopics.example" }),
    ).toThrow(/SITE_URL must be this machine/);
    expect(() =>
      readServerEnv({
        ...valid,
        DATABASE_URL: "postgres://app:pw@db.project.supabase.co:5432/postgres",
      }),
    ).toThrow(/DATABASE_URL must be a service on this machine/);
    expect(() =>
      readServerEnv({
        ...hosted,
        APP_ENV: "production",
        SITE_URL: "https://dev.countrytopics.example",
      }),
    ).toThrow(/SITE_URL is a staging address/);
    expect(() =>
      readServerEnv({
        ...valid,
        APP_ENV: "production",
        SITE_URL: "https://countrytopics.example",
      }),
    ).toThrow(/DATABASE_URL must not point at this machine/);
    expect(() =>
      readServerEnv({
        ...hosted,
        APP_ENV: "staging",
        SITE_URL: "https://dev.countrytopics.example",
        S3_ENDPOINT: "http://storage:8333",
      }),
    ).toThrow(/S3_ENDPOINT must use https/);
    // A mistyped APP_ENV is reported alone, not with every address.
    expect(() =>
      readServerEnv({
        ...hosted,
        APP_ENV: "prod",
        SITE_URL: "https://countrytopics.example",
      }),
    ).toThrow(
      /configuration:\n- APP_ENV must be one of: local, staging, production$/,
    );
  });

  it("reads the backend's own address and the frontend's key", () => {
    expect(
      readServerEnv({ ...valid, BACKEND_URL: "http://localhost:3002/" })
        .backendUrl,
    ).toBe("http://localhost:3002");
    expect(() =>
      readServerEnv({ ...valid, BACKEND_URL: "localhost:3002" }),
    ).toThrow(/BACKEND_URL must be an http\(s\) origin/);
    expect(() =>
      readServerEnv({ ...valid, BACKEND_URL: "http://localhost:3000" }),
    ).toThrow(/BACKEND_URL must differ from SITE_URL/);
    expect(() => readServerEnv({ ...valid, FORWARDING_KEY: "short" })).toThrow(
      /FORWARDING_KEY must be at least 32 characters/,
    );
    expect(() =>
      readServerEnv({ ...valid, FORWARDING_KEY: "short" }),
    ).not.toThrow("short");
  });

  it("allows Payload's panel at the backend's address only locally", () => {
    const hosted = {
      ...valid,
      DATABASE_URL: "postgres://app:pw@db.example.org:5432/countrytopics",
      REDIS_URL: "redis://redis:6379",
      S3_ENDPOINT: "https://storage.example.org",
      APP_ENV: "production",
      SITE_URL: "https://countrytopics.example",
      BACKEND_URL: "https://api.countrytopics.example",
    };
    expect(readServerEnv(hosted)).toMatchObject({
      backendUrl: "https://api.countrytopics.example",
      panelOrigin: undefined,
    });
    expect(() =>
      readServerEnv({ ...hosted, BACKEND_URL: "http://localhost:3002" }),
    ).toThrow(/BACKEND_URL must not point at this machine/);
    expect(() =>
      readServerEnv({
        ...hosted,
        BACKEND_URL: "http://api.countrytopics.example",
      }),
    ).toThrow(/BACKEND_URL must use https/);
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
      readServerEnv({ ...valid, SITE_URL: "http://localhost:3000/" }).siteUrl,
    ).toBe("http://localhost:3000");
    expect(() =>
      readServerEnv({ ...valid, SITE_URL: "http://localhost:3000/app" }),
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
