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
// two share SITE_URL, BACKEND_URL, and FORWARDING_KEY. Real environment
// variables take precedence over the file.
const rootEnvFile = path.join(workspaceRoot, ".env");
if (existsSync(rootEnvFile)) process.loadEnvFile(rootEnvFile);

const nextConfig: NextConfig = {
  agentRules: false,
  // Workspace packages ship TypeScript source.
  transpilePackages: [
    "@countrytopics/environment",
    "@countrytopics/forwarding",
  ],
  outputFileTracingRoot: workspaceRoot,
  poweredByHeader: false,
  turbopack: { root: workspaceRoot },
  async rewrites() {
    const backendUrl = process.env.BACKEND_URL?.trim();
    return {
      // The build files of the pages the backend still renders, and its
      // development server's live reload, a websocket, which a route
      // cannot pass on but Next.js's own proxying can (pass-through.ts).
      // Gone with those pages in phase 5.
      beforeFiles: backendUrl
        ? [
            {
              source: "/_backend/_next/:path*",
              destination: `${backendUrl}/_backend/_next/:path*`,
            },
          ]
        : [],
    };
  },
};

export default nextConfig;
