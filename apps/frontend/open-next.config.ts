import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// The frontend on Cloudflare Workers (ADR 0014). It renders no pages of its
// own yet, so no cache is set up; phase 5 adds phase 1's R2 incremental
// cache, D1 tags, and Durable Object queue with the pages.
const config = {
  ...defineCloudflareConfig({}),
  // Not `pnpm build`, which would rerun this build.
  buildCommand: "next build",
};

export default config;
