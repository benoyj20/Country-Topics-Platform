import { getCloudflareContext } from "@opennextjs/cloudflare";

/** The topic's cache tag, as apps/web's public-cache.ts names them. */
export function topicTag(slug: string): string {
  return `topic:${slug}`;
}

/** The spike's settings, from wrangler.jsonc's vars. */
export function spikeEnv(): CloudflareEnv {
  return getCloudflareContext().env;
}
