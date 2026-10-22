import { loadPayload } from "@/payload-instance";

import type { BrowseTerms } from "./types";

// What browsing filters by (browse.ts).

/**
 * Every country, category, and tag, for browsing: their slugs in URLs
 * become ids for the search index, and the index's ids become names.
 */
export async function loadBrowseTerms(): Promise<BrowseTerms> {
  const payload = await loadPayload();
  const all = { depth: 0, pagination: false, overrideAccess: true } as const;
  const [countries, categories, tags] = await Promise.all([
    payload.find({
      collection: "countries",
      select: { name: true, slug: true, region: true },
      sort: "name",
      ...all,
    }),
    payload.find({
      collection: "categories",
      select: { name: true, slug: true },
      sort: "name",
      ...all,
    }),
    payload.find({
      collection: "tags",
      select: { name: true, slug: true },
      sort: "name",
      ...all,
    }),
  ]);
  const term = (doc: { id: string; name: string; slug: string }) => ({
    id: String(doc.id),
    name: doc.name,
    slug: doc.slug,
  });
  return {
    countries: countries.docs.map((doc) => ({
      ...term(doc),
      region: doc.region ?? null,
    })),
    categories: categories.docs.map(term),
    tags: tags.docs.map(term),
  };
}
