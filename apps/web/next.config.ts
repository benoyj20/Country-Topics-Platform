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
    "@countrytopics/forwarding",
    "@countrytopics/jobs",
    "@countrytopics/observability",
    "@countrytopics/search",
    "@countrytopics/sources",
  ],
  outputFileTracingRoot: workspaceRoot,
  // The pages this backend still renders reach browsers through the
  // frontend (ADR 0014), whose own build files are under /_next, so these
  // pages name theirs under /_backend/_next and the frontend passes that
  // path on. Removed with the pages in phase 12.
  assetPrefix: "/_backend",
  experimental: {
    // Next.js checks that a page-data request's _rsc parameter matches its
    // router headers, against caches that ignore Vary. The frontend makes
    // that check on every browser request, then drops the Next-Url header
    // before passing the request on, so here it would always fail and
    // redirect. The backend is reached only through the frontend; this
    // goes with the pages in phase 12.
    validateRSCRequestHeaders: false,
  },
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
