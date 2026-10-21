import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  type AppEnvironment,
  checkServiceAddress,
  checkSiteAddress,
  errorEnvironmentFor,
  isLoopbackHostname,
  readAppEnvironment,
  readSiteUrl,
} from "../src/index.ts";

function siteProblems(
  environment: AppEnvironment | undefined,
  value: string,
): string[] {
  const problems: string[] = [];
  checkSiteAddress(environment, "SITE_URL", value, problems);
  return problems;
}

function serviceProblems(
  environment: AppEnvironment | undefined,
  value: string | undefined,
): string[] {
  const problems: string[] = [];
  checkServiceAddress(environment, "DATABASE_URL", value, problems);
  return problems;
}

describe("readAppEnvironment", () => {
  it("defaults to local and reads each environment", () => {
    const problems: string[] = [];
    assert.equal(readAppEnvironment({}, problems), "local");
    assert.equal(readAppEnvironment({ APP_ENV: " " }, problems), "local");
    assert.equal(
      readAppEnvironment({ APP_ENV: "staging" }, problems),
      "staging",
    );
    assert.equal(
      readAppEnvironment({ APP_ENV: " Production " }, problems),
      "production",
    );
    assert.deepEqual(problems, []);
  });

  it("refuses any other value, naming the variable only", () => {
    const problems: string[] = [];
    assert.equal(
      readAppEnvironment({ APP_ENV: "prod-secret" }, problems),
      undefined,
    );
    assert.deepEqual(problems, [
      "APP_ENV must be one of: local, staging, production",
    ]);
  });
});

describe("errorEnvironmentFor", () => {
  it("labels errors by environment, keeping development for local", () => {
    assert.equal(errorEnvironmentFor("local"), "development");
    assert.equal(errorEnvironmentFor("staging"), "staging");
    assert.equal(errorEnvironmentFor("production"), "production");
    assert.equal(errorEnvironmentFor(undefined), "development");
  });
});

describe("readSiteUrl", () => {
  it("reads the origin and refuses paths and other schemes", () => {
    const problems: string[] = [];
    assert.equal(
      readSiteUrl({ SITE_URL: " http://localhost:3000/ " }, problems),
      "http://localhost:3000",
    );
    assert.deepEqual(problems, []);
    for (const value of ["http://localhost:3000/app", "ftp://localhost", ""]) {
      const refused: string[] = [];
      readSiteUrl({ SITE_URL: value }, refused);
      assert.equal(refused.length, 1, value);
    }
  });
});

describe("isLoopbackHostname", () => {
  it("knows this machine's names, as URL gives them", () => {
    for (const hostname of [
      "localhost",
      "app.localhost",
      "127.0.0.1",
      "127.1",
      "127.0.0.2",
      "0.0.0.0",
      "[::1]",
    ]) {
      assert.equal(isLoopbackHostname(hostname), true, hostname);
    }
    for (const hostname of [
      "localhost.example.org",
      "127.example.org",
      "10.0.0.1",
    ]) {
      assert.equal(isLoopbackHostname(hostname), false, hostname);
    }
  });
});

describe("checkSiteAddress", () => {
  it("lets local run on this machine, the local network, or a quick tunnel", () => {
    for (const value of [
      "http://localhost:3000",
      "http://127.0.0.1:8080",
      "http://app.localhost:3000",
      "http://192.168.1.20:3000",
      "https://premier-trying-strike-amd.trycloudflare.com",
    ]) {
      assert.deepEqual(siteProblems("local", value), [], value);
    }
    for (const value of [
      "https://example.org",
      "https://dev.example.org",
      "https://a.b.trycloudflare.com",
      "https://trycloudflare.com.example.org",
      "http://172.32.0.1:3000",
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
    assert.deepEqual(
      siteProblems("production", "https://devices.example.org"),
      [],
    );
    for (const value of [
      "https://dev.example.org",
      "https://DEV.example.org",
      "http://example.org",
      "http://localhost:3000",
      "https://10.0.0.5",
      "https://name.trycloudflare.com",
    ]) {
      assert.equal(siteProblems("production", value).length, 1, value);
    }
  });

  it("checks nothing for an unknown environment or an unparsable address", () => {
    assert.deepEqual(siteProblems(undefined, "https://example.org"), []);
    assert.deepEqual(siteProblems("production", "not a url"), []);
  });
});

describe("checkServiceAddress", () => {
  it("lets local use this machine and its containers only", () => {
    for (const value of [
      "postgres://u:pw@localhost:5433/countrytopics",
      "postgres://u@postgres:5432/countrytopics",
      "http://storage:8333",
      "smtp://mailpit:1025",
      "redis://host.docker.internal:6379",
      "postgres://u:pw@192.168.1.5:5432/countrytopics",
    ]) {
      assert.deepEqual(serviceProblems("local", value), [], value);
    }
    for (const value of [
      "postgres://u:pw@db.project.supabase.co:5432/postgres",
      "https://account.r2.cloudflarestorage.com",
      "smtps://smtp.resend.com:465",
    ]) {
      assert.equal(serviceProblems("local", value).length, 1, value);
    }
  });

  it("keeps hosted environments off this machine and plain http", () => {
    for (const value of [
      "https://account.r2.cloudflarestorage.com",
      "postgres://user:pw@db.example.org:5432/app",
      // A Compose service beside the hosted app, such as its Valkey.
      "redis://redis:6379",
    ]) {
      assert.deepEqual(serviceProblems("production", value), [], value);
    }
    for (const value of [
      "http://storage:8333",
      "postgres://user:pw@localhost:5432/app",
      "postgres://user:pw@LOCALHOST:5432/app",
      "postgres://user:pw@localhost.:5432/app",
      "redis://127.1:6379",
      "redis://0.0.0.0:6379",
      "postgres://user:pw@db.example.org:5432/app?host=localhost",
      "postgres://user:pw@h1:5432,h2:5432/app",
    ]) {
      assert.equal(serviceProblems("staging", value).length, 1, value);
    }
  });

  it("skips unset values and unknown environments", () => {
    assert.deepEqual(serviceProblems("production", undefined), []);
    assert.deepEqual(serviceProblems(undefined, "http://localhost"), []);
  });

  it("names the variable, never the address", () => {
    const [problem] = serviceProblems(
      "production",
      "postgres://user:secret-password@localhost:5432/app",
    );
    assert.ok(problem?.startsWith("DATABASE_URL "));
    assert.ok(!problem?.includes("secret-password"));
  });
});
