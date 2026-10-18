import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  parseSentryDsn,
  readErrorReporting,
  scrubBreadcrumb,
  scrubErrorEvent,
  withoutEmails,
} from "../src/index.ts";

const DSN = "https://publickey@o123.ingest.us.sentry.io/4567";

describe("readErrorReporting", () => {
  it("is off without a DSN and reads one with its environment", () => {
    const problems: string[] = [];
    assert.equal(readErrorReporting({}, problems), undefined);
    assert.deepEqual(
      readErrorReporting(
        { SENTRY_DSN: ` ${DSN} `, SENTRY_ENVIRONMENT: "pilot" },
        problems,
      ),
      {
        dsn: { dsn: DSN, host: "o123.ingest.us.sentry.io", projectId: "4567" },
        environment: "pilot",
      },
    );
    assert.deepEqual(problems, []);
  });

  it("names the variable, never the value, when one is wrong", () => {
    const problems: string[] = [];
    readErrorReporting(
      { SENTRY_DSN: "http://secret@x/1", SENTRY_ENVIRONMENT: "Pilot!" },
      problems,
    );
    assert.equal(problems.length, 2);
    assert.ok(problems.every((problem) => !problem.includes("secret")));
    assert.equal(parseSentryDsn("https://o1.sentry.io/1"), null);
    assert.equal(parseSentryDsn("https://key@o1.sentry.io/abc"), null);
  });
});

describe("scrubErrorEvent", () => {
  it("drops the user, cookies, bodies, queries, and most headers", () => {
    const scrubbed = scrubErrorEvent({
      user: { id: "u1", email: "TEST@example.test" },
      request: {
        url: "https://site.example/topics?q=private#comment-1",
        query_string: "q=private",
        cookies: { session: "secret" },
        data: { email: "TEST@example.test" },
        headers: { Cookie: "session=secret", "User-Agent": "TEST browser" },
      },
    });
    assert.equal(scrubbed.user, undefined);
    assert.deepEqual(scrubbed.request, {
      url: "https://site.example/topics",
      headers: { "User-Agent": "TEST browser" },
    });
  });

  it("hides email addresses in messages and errors", () => {
    const scrubbed = scrubErrorEvent({
      message: "Could not invite test.member+1@example.test today",
      exception: { values: [{ value: "Duplicate key: a@b.example" }] },
      logentry: { message: "Failed for %s", params: ["x@y.example", 3] },
    });
    assert.equal(scrubbed.message, "Could not invite [email] today");
    assert.equal(
      scrubbed.exception?.values?.[0]?.value,
      "Duplicate key: [email]",
    );
    assert.deepEqual(scrubbed.logentry?.params, ["[email]", 3]);
    assert.equal(withoutEmails("no address here"), "no address here");
  });

  it("hides email addresses in console arguments and other extra data", () => {
    const scrubbed = scrubErrorEvent({
      extra: {
        arguments: [
          "email job 12 failed:",
          "550 <alice@example.test>: Recipient address rejected",
          { nested: ["bob@example.test"] },
        ],
      },
    });
    assert.deepEqual(scrubbed.extra, {
      arguments: [
        "email job 12 failed:",
        "550 <[email]>: Recipient address rejected",
        { nested: ["[email]"] },
      ],
    });
  });

  it("keeps page changes and requests, without queries, and drops console output", () => {
    assert.deepEqual(
      scrubBreadcrumb({
        category: "navigation",
        data: { from: "/topics?q=a", to: "/account" },
      }),
      {
        category: "navigation",
        message: undefined,
        data: { from: "/topics", to: "/account" },
      },
    );
    assert.equal(
      scrubBreadcrumb({ category: "console", message: "TEST@example.test" }),
      null,
    );
    assert.equal(
      scrubBreadcrumb({ category: "ui.click", message: "input" }),
      null,
    );
  });
});
