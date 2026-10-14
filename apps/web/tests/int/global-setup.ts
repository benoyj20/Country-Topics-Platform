import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { testDatabaseUrl } from "./test-database";

const appRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const MIGRATE_TIMEOUT_MS = 120_000;

// Points every test at the dedicated test database; test workers start after
// this and inherit the environment.
export default function setup(): void {
  process.env.DATABASE_URL = testDatabaseUrl(process.env);
  process.env.DATABASE_REPLICA_URL = "";

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
