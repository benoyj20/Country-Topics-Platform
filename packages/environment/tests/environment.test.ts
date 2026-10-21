import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  type AppEnvironment,
  checkServiceAddress,
  checkSiteAddress,
  isLoopbackHostname,
  readAppEnvironment,
} from "../src/index.ts";

function siteProblems(environment: AppEnvironment, value: string): string[] {
  const problems: string[] = [];
  checkSiteAddress(environment, "SITE_URL", value, problems);
  return problems;
}

function serviceProblems(
  environment: AppEnvironment,
  value: string | undefined,
): string[] {
  const problems: string[] = [];
  checkServiceAddress(environment, "S3_ENDPOINT", value, problems);
  return problems;
}

describe("readAppEnvironment", () => {
  it("defaults to local and reads each environment", () => {
    const problems: string[] = [];
    assert.equal(readAppEnvironment({}, problems), "local");
    assert.equal(readAppEnvironment({ APP_ENV: " " }, problems), "local");
    assert.equal(readAppEnvironment({ APP_ENV: "staging" }, problems), "staging");
    assert.equal(
      readAppEnvironment({ APP_ENV: " Production " }, problems),
      "production",
    );
    assert.deepEqual(problems, []);
  });

  it("refuses any other value, naming the variable only", () => {
    const problems: string[] = [];
    readAppEnvironment({ APP_ENV: "prod-secret" }, problems);
    assert.deepEqual(problems, [
      "APP_ENV must be one of: local, staging, production",
    ]);
  });
});

describe("isLoopbackHostname", () => {
  it("knows this machine's names, as URL gives them", () => {
    for (const url of [
      "http://localhost:3000",
      "http://127.0.0.1:3000",
      "http://[::1]:3000",
    ]) {
      assert.equal(isLoopbackHostname(new URL(url).hostname), true, url);
    }
    assert.equal(isLoopbackHostname("localhost.example.org"), false);
  });
});

describe("checkSiteAddress", () => {
  it("lets local run on this machine or a quick tunnel only", () => {
    assert.deepEqual(siteProblems("local", "http://localhost:3000"), []);
    assert.deepEqual(siteProblems("local", "http://127.0.0.1:8080"), []);
    assert.deepEqual(
      siteProblems("local", "https://premier-trying-strike-amd.trycloudflare.com"),
      [],
    );
    for (const value of [
      "https://example.org",
      "https://dev.example.org",
      "https://a.b.trycloudflare.com",
      "https://trycloudflare.com.example.org",
    ]) {
      assert.equal(siteProblems("local", value).length, 1, value);
    }
  });

  it("keeps staging at an https dev. address", () => {
    assert.deepEqual(siteProblems("staging", "https://dev.example.org"), []);
    assert.equal(siteProblems("staging", "https://example.org").length, 1);
    assert.equal(siteProblems("staging", "http://dev.example.org").length, 1);
    assert.equal(siteProblems("staging", "https://localhost").length, 1);
  });

  it("keeps production off staging's, local, and demo addresses", () => {
    assert.deepEqual(siteProblems("production", "https://example.org"), []);
    assert.deepEqual(siteProblems("production", "https://www.example.org"), []);
    // A label merely starting with "dev" is not staging's address.
    assert.deepEqual(siteProblems("production", "https://devices.example.org"), []);
    for (const value of [
      "https://dev.example.org",
      "http://example.org",
      "http://localhost:3000",
      "https://name.trycloudflare.com",
    ]) {
      assert.equal(siteProblems("production", value).length, 1, value);
    }
  });

  it("leaves an unparsable address to the caller's own check", () => {
    assert.deepEqual(siteProblems("production", "not a url"), []);
  });
});

describe("checkServiceAddress", () => {
  it("lets local use any service, and skips unset ones", () => {
    assert.deepEqual(serviceProblems("local", "http://localhost:8333"), []);
    assert.deepEqual(serviceProblems("production", undefined), []);
  });

  it("keeps hosted environments off this machine and plain http", () => {
    assert.deepEqual(
      serviceProblems("production", "https://account.r2.cloudflarestorage.com"),
      [],
    );
    assert.deepEqual(
      serviceProblems("staging", "postgres://user:pw@db.example.org:5432/app"),
      [],
    );
    assert.equal(serviceProblems("staging", "http://storage:8333").length, 1);
    assert.equal(
      serviceProblems("production", "postgres://user:pw@localhost:5432/app")
        .length,
      1,
    );
    assert.equal(serviceProblems("production", "redis://127.0.0.1:6379").length, 1);
  });

  it("names the variable, never the address", () => {
    const [problem] = serviceProblems(
      "production",
      "postgres://user:secret-password@localhost:5432/app",
    );
    assert.ok(problem?.startsWith("S3_ENDPOINT "));
    assert.ok(!problem?.includes("secret-password"));
  });
});
