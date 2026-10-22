import "server-only";

import {
  CountryPage,
  HomePage,
  IndividualPage,
  PAGE_DATA_PATHS,
  PAGE_DATA_TAGS,
  type PublicTag,
  TopicPage,
} from "@countrytopics/contracts";
import { unstable_cache } from "next/cache";
import { cache } from "react";
import type * as z from "zod";

import { FRONTEND_ADDRESS, readBackend } from "./request";

// The public pages' data, from the backend's /api/v1/pages endpoints (ADR
// 0014). Each answer is cached under its path and its collections' tags,
// so a purge of a tag refreshes every page that shows it, as the pages are
// refreshed themselves. The cache is keyed by the path, not by the fetch:
// Next.js would key a fetch by its headers too, and each read is signed
// afresh, so it would never hit.

/** How long page data is kept without a purge; the pages' `revalidate`. */
export const PAGE_DATA_LIFETIME_S = 3600;

function pageData<T>(
  path: string,
  schema: z.ZodType<T>,
  tags: readonly PublicTag[],
): Promise<T | null> {
  return unstable_cache(
    () => readBackend(path, schema, { clientAddress: FRONTEND_ADDRESS }),
    ["page-data", path],
    { tags: [...tags], revalidate: PAGE_DATA_LIFETIME_S },
  )();
}

// Wrapped in React's cache, so a page and its metadata share one read.

export const homePage = cache(async (): Promise<HomePage> => {
  const page = await pageData(
    PAGE_DATA_PATHS.home,
    HomePage,
    PAGE_DATA_TAGS.home,
  );
  // The home page always exists; a 404 means the backend is not this one.
  if (!page) throw new Error("The backend has no home page data.");
  return page;
});

export const topicPage = cache((slug: string): Promise<TopicPage | null> =>
  pageData(PAGE_DATA_PATHS.topic(slug), TopicPage, PAGE_DATA_TAGS.topic),
);

export const countryPage = cache((slug: string): Promise<CountryPage | null> =>
  pageData(PAGE_DATA_PATHS.country(slug), CountryPage, PAGE_DATA_TAGS.country),
);

export const individualPage = cache(
  (slug: string): Promise<IndividualPage | null> =>
    pageData(
      PAGE_DATA_PATHS.individual(slug),
      IndividualPage,
      PAGE_DATA_TAGS.individual,
    ),
);
