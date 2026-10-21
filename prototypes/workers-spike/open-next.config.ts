import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import r2IncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache";
import doQueue from "@opennextjs/cloudflare/overrides/queue/do-queue";
import d1NextTagCache from "@opennextjs/cloudflare/overrides/tag-cache/d1-next-tag-cache";

// ADR 0014's cache: pages in R2, tags in D1, background revalidation
// through a Durable Object queue.
export default {
  ...defineCloudflareConfig({
    incrementalCache: r2IncrementalCache,
    tagCache: d1NextTagCache,
    queue: doQueue,
  }),
  // Not `pnpm build`: the spike has no build script, so the workspace's
  // `pnpm build` (and CI) leave it alone.
  buildCommand: "next build",
};
