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

// Local runs read the repository's .env, which the backend reads too: the
// two share SITE_URL, BACKEND_URL, and FORWARDING_KEY, and the worker
// PURGE_KEY. Real environment variables take precedence over the file.
const rootEnvFile = path.join(workspaceRoot, ".env");
if (existsSync(rootEnvFile)) process.loadEnvFile(rootEnvFile);

const nextConfig: NextConfig = {
  agentRules: false,
  // Workspace packages ship TypeScript source.
  transpilePackages: [
    "@countrytopics/contracts",
    "@countrytopics/domain",
    "@countrytopics/environment",
    "@countrytopics/forwarding",
    "@countrytopics/observability",
  ],
  outputFileTracingRoot: workspaceRoot,
  poweredByHeader: false,
  experimental: {
    // The site and the admin have separate root layouts, so an address
    // that matches no route needs a 404 of its own
    // (app/global-not-found.tsx).
    globalNotFound: true,
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // No other site may frame these pages (clickjacking on the admin).
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

export default nextConfig;
