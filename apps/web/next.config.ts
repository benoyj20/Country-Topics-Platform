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
  // Pages and cached data live in Valkey, shared by every web process, so
  // a purge reaches all of them; no process keeps its own copy (ADR 0013).
  cacheHandler: fileURLToPath(new URL("./cache-handler.mjs", import.meta.url)),
  cacheMaxMemorySize: 0,
  // The repository's AGENTS.md holds agent rules; stop `next dev` writing its own.
  agentRules: false,
  // Workspace packages ship TypeScript source.
  transpilePackages: [
    "@countrytopics/contracts",
    "@countrytopics/domain",
    "@countrytopics/email",
    "@countrytopics/environment",
    "@countrytopics/jobs",
    "@countrytopics/observability",
    "@countrytopics/search",
    "@countrytopics/sources",
  ],
  outputFileTracingRoot: workspaceRoot,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // No other site may frame these pages (clickjacking on the admin panel).
          { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
  turbopack: { root: workspaceRoot },
};

export default withPayload(nextConfig, { devBundleServerPackages: false });
