import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { DEFAULT_QUEUE_PREFIX, readWorkerEnv } from "../src/env.ts";

const valid = {
  REDIS_URL: "redis://localhost:6379",
  SMTP_URL: "smtp://localhost:1025",
  EMAIL_FROM: "Country Topics <no-reply@localhost>",
  DATABASE_URL: "postgres://user:pw@localhost:5433/countrytopics",
  SITE_URL: "http://localhost:3000",
};

describe("readWorkerEnv", () => {
  it("reads a valid configuration with the default queue prefix", () => {
    assert.deepEqual(readWorkerEnv(valid), {
      environment: "local",
      redisUrl: valid.REDIS_URL,
      smtpUrl: valid.SMTP_URL,
      emailFrom: valid.EMAIL_FROM,
      queuePrefix: DEFAULT_QUEUE_PREFIX,
      databaseUrl: valid.DATABASE_URL,
      siteUrl: valid.SITE_URL,
      contactEmail: undefined,
      googleBooksApiKey: undefined,
      youtubeApiKey: undefined,
      wayback: undefined,
      errorReporting: undefined,
    });
  });

  it("turns error reporting on with a Sentry DSN", () => {
    const env = readWorkerEnv({
      ...valid,
      SENTRY_DSN: "https://key@o1.ingest.us.sentry.io/2",
      SENTRY_ENVIRONMENT: "pilot",
    });
    assert.equal(env.errorReporting?.environment, "pilot");
    assert.throws(
      () => readWorkerEnv({ ...valid, SENTRY_DSN: "not a dsn" }),
      /SENTRY_DSN must be empty or the project's DSN/,
    );
  });

  it("refuses to start with another environment's addresses", () => {
    const hosted = {
      ...valid,
      APP_ENV: "production",
      REDIS_URL: "redis://redis:6379",
      SMTP_URL: "smtps://smtp.example.org:465",
      DATABASE_URL: "postgres://user:pw@db.example.org:5432/countrytopics",
      SITE_URL: "https://countrytopics.example",
    };
    assert.equal(readWorkerEnv(hosted).environment, "production");
    assert.throws(
      () => readWorkerEnv({ ...hosted, SMTP_URL: valid.SMTP_URL }),
      /SMTP_URL must not point at this machine/,
    );
    assert.throws(
      () => readWorkerEnv({ ...valid, SITE_URL: "https://countrytopics.example" }),
      /SITE_URL must be localhost or a quick-tunnel address/,
    );
  });

  it("lists every problem by variable name", () => {
    assert.throws(
      () => readWorkerEnv({ QUEUE_PREFIX: "Bad Prefix!" }),
      /REDIS_URL[\s\S]*SMTP_URL[\s\S]*EMAIL_FROM[\s\S]*QUEUE_PREFIX[\s\S]*DATABASE_URL[\s\S]*SITE_URL/,
    );
  });

  it("accepts TLS URLs", () => {
    const env = readWorkerEnv({
      ...valid,
      REDIS_URL: "rediss://cache.example:6380",
      SMTP_URL: "smtps://user:pw@smtp.example:465",
    });
    assert.equal(env.redisUrl, "rediss://cache.example:6380");
  });

  it("reads the optional contact address and API keys", () => {
    const env = readWorkerEnv({
      ...valid,
      CONTACT_EMAIL: "team@example.test",
      GOOGLE_BOOKS_API_KEY: "books-key",
      YOUTUBE_API_KEY: " youtube-key ",
      WAYBACK_ACCESS_KEY: "access",
      WAYBACK_SECRET_KEY: "secret",
    });
    assert.equal(env.contactEmail, "team@example.test");
    assert.equal(env.googleBooksApiKey, "books-key");
    assert.equal(env.youtubeApiKey, "youtube-key");
    assert.deepEqual(env.wayback, { accessKey: "access", secretKey: "secret" });
  });

  it("refuses one Wayback Machine key without the other, without printing it", () => {
    assert.throws(
      () => readWorkerEnv({ ...valid, WAYBACK_SECRET_KEY: "do-not-print" }),
      (error: Error) =>
        /WAYBACK_ACCESS_KEY and WAYBACK_SECRET_KEY/.test(error.message) &&
        !error.message.includes("do-not-print"),
    );
    assert.throws(
      () => readWorkerEnv({ ...valid, CONTACT_EMAIL: "not an address" }),
      /CONTACT_EMAIL/,
    );
  });
});
