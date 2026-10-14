import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { DEFAULT_QUEUE_PREFIX, readWorkerEnv } from "../src/env.ts";

const valid = {
  REDIS_URL: "redis://localhost:6379",
  SMTP_URL: "smtp://localhost:1025",
  EMAIL_FROM: "Country Topics <no-reply@localhost>",
};

describe("readWorkerEnv", () => {
  it("reads a valid configuration with the default queue prefix", () => {
    assert.deepEqual(readWorkerEnv(valid), {
      redisUrl: valid.REDIS_URL,
      smtpUrl: valid.SMTP_URL,
      emailFrom: valid.EMAIL_FROM,
      queuePrefix: DEFAULT_QUEUE_PREFIX,
    });
  });

  it("lists every problem by variable name", () => {
    assert.throws(
      () => readWorkerEnv({ QUEUE_PREFIX: "Bad Prefix!" }),
      /REDIS_URL[\s\S]*SMTP_URL[\s\S]*EMAIL_FROM[\s\S]*QUEUE_PREFIX/,
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
});
