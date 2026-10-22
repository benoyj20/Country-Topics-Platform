import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { testBucket, testDatabaseUrl } from "./test-database";

const appRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const MIGRATE_TIMEOUT_MS = 120_000;

// Points every test at the dedicated test database and a separate queue, with
// fixed sign-in settings; test workers start after this and inherit the
// environment.
export default function setup(): void {
  const runId = Date.now().toString(36);
  Object.assign(process.env, {
    DATABASE_URL: testDatabaseUrl(process.env),
    DATABASE_REPLICA_URL: "",
    // Uploads go to the test bucket, never the site's.
    S3_BUCKET: testBucket(process.env),
    // The dev worker uses the default prefix; tests must not feed it jobs.
    QUEUE_PREFIX: "countrytopics-test",
    SITE_URL: "http://localhost:3000",
    INVITE_ONLY: "true",
    ADMIN_EMAILS: `owner-${runId}@example.test`,
    GOOGLE_CLIENT_ID: "test-client.apps.googleusercontent.com",
    GOOGLE_CLIENT_SECRET: "test-client-secret",
    // Turnstile would call Cloudflare; its wiring has unit tests instead.
    TURNSTILE_SITE_KEY: "",
    TURNSTILE_SECRET_KEY: "",
    // The tests call the routes directly, as the frontend's signed requests
    // reach them once checked; the check itself has unit tests.
    FORWARDING_KEY: "test-forwarding-key-not-used-anywhere-else",
    // Tests must never send errors to the real Sentry project; the route
    // that passes reports on has unit tests with a stand-in.
    SENTRY_DSN: "",
    SENTRY_ENVIRONMENT: "",
    // Mailpit keeps old messages, so each run uses fresh addresses.
    TEST_RUN_ID: runId,
  });

  // Drops every table and reruns the committed migrations, so each run starts
  // empty and proves the migrations apply cleanly. This uses the Payload CLI
  // because it loads the TypeScript migration files with its own loader; inside
  // Vitest, Node's type stripping fails on their type-only imports.
  execFileSync(
    process.execPath,
    [
      path.join(appRoot, "node_modules/payload/bin.js"),
      "migrate:fresh",
      "--force-accept-warning",
    ],
    {
      cwd: appRoot,
      env: process.env,
      stdio: "inherit",
      timeout: MIGRATE_TIMEOUT_MS,
    },
  );
}
