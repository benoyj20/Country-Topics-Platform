import { withPayload } from "@payloadcms/next/withPayload";
import type { NextConfig } from "next";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// pnpm installs packages at the workspace root, so Turbopack and output file
// tracing must be able to see it.
const workspaceRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

// Local runs read the repository's .env. Containers set real environment
// variables, which take precedence over the file. (Next.js rejects Node's
// --env-file flags because it forwards them to its build workers.)
const rootEnvFile = path.join(workspaceRoot, ".env");
if (existsSync(rootEnvFile)) process.loadEnvFile(rootEnvFile);

const nextConfig: NextConfig = {
  // The repository's AGENTS.md holds agent rules; stop `next dev` writing its own.
  agentRules: false,
  outputFileTracingRoot: workspaceRoot,
  poweredByHeader: false,
  turbopack: { root: workspaceRoot },
};

export default withPayload(nextConfig, { devBundleServerPackages: false });
