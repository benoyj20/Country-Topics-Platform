import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { emailJobSchema, renderEmailJob } from "../src/email-jobs.ts";

const valid = {
  kind: "magic-link",
  to: "member@example.test",
  url: "http://localhost:3000/api/auth/magic-link/verify?token=abc",
  expiresInMinutes: 10,
} as const;

describe("emailJobSchema", () => {
  it("accepts a sign-in link job", () => {
    assert.deepEqual(emailJobSchema.parse(valid), valid);
  });

  it("rejects bad addresses, non-web links, and long expiries", () => {
    for (const bad of [
      { ...valid, to: "not-an-email" },
      { ...valid, url: "javascript:alert(1)" },
      { ...valid, expiresInMinutes: 61 },
      { ...valid, kind: "newsletter" },
    ]) {
      assert.equal(
        emailJobSchema.safeParse(bad).success,
        false,
        JSON.stringify(bad),
      );
    }
  });
});

describe("renderEmailJob", () => {
  it("renders the sign-in email for the recipient", () => {
    const message = renderEmailJob(valid);

    assert.equal(message.to, valid.to);
    assert.match(message.subject, /sign-in link/);
    assert.match(message.text, /token=abc/);
  });
});
