import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { ComponentProps } from "react";

import type { TopicBody } from "./TopicBody";

/**
 * The tags apps/web gives the topic page's data (public-cache.ts's
 * PUBLIC_TAGS): publishing purges by collection, not by document.
 */
export const TOPIC_PAGE_TAGS = [
  "public:topics",
  "public:individuals",
  "public:countries",
  "public:categories",
  "public:tags",
  "public:snippets",
] as const;

/** Page data waits at most this long for the backend. */
const PAGE_DATA_TIMEOUT_MS = 10_000;

export type TopicPage = {
  slug: string;
  title: string;
  summary: string;
  body: ComponentProps<typeof TopicBody>["body"];
  bodyLinks: Record<string, string>;
};

/** The spike's settings, from wrangler.jsonc's vars. */
export function spikeEnv(): CloudflareEnv {
  return getCloudflareContext().env;
}

function isTopicPage(value: unknown): value is TopicPage {
  if (!value || typeof value !== "object") return false;
  const page = value as Record<string, unknown>;
  return (
    typeof page.slug === "string" &&
    typeof page.title === "string" &&
    typeof page.summary === "string" &&
    !!page.body &&
    typeof page.body === "object" &&
    "root" in page.body &&
    !!page.bodyLinks &&
    typeof page.bodyLinks === "object"
  );
}

/**
 * A topic's page data, cached for `lifetimeS` seconds under the site's
 * tags; null when there is no such published topic.
 */
export async function loadTopicPage(
  slug: string,
  lifetimeS: number,
): Promise<TopicPage | null> {
  const response = await fetch(
    `${spikeEnv().BACKEND_URL}/api/v1/pages/topics/${encodeURIComponent(slug)}`,
    {
      next: { revalidate: lifetimeS, tags: [...TOPIC_PAGE_TAGS] },
      signal: AbortSignal.timeout(PAGE_DATA_TIMEOUT_MS),
    },
  );
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`page data answered ${response.status}`);
  const page: unknown = await response.json();
  if (!isTopicPage(page)) throw new Error("page data has an unexpected shape");
  return page;
}
