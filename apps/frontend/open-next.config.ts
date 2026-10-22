import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import r2IncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache";
import doQueue from "@opennextjs/cloudflare/overrides/queue/do-queue";
import d1NextTagCache from "@opennextjs/cloudflare/overrides/tag-cache/d1-next-tag-cache";

// The frontend on Cloudflare Workers, with ADR 0014's cache, as phase 1
// tried it: pages and page data in R2, their tags in D1, and background
// revalidation through a Durable Object queue (wrangler.jsonc's bindings).
const config = {
  ...defineCloudflareConfig({
    incrementalCache: r2IncrementalCache,
    tagCache: d1NextTagCache,
    queue: doQueue,
  }),
  // This package's `build`: Next.js's, then the build-time pages left out
  // (scripts/drop-build-time-pages.mjs).
  buildCommand: "pnpm build",
};

export default config;
