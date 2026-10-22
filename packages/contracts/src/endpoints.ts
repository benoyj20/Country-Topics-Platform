import { isSlug } from "@countrytopics/domain";

// Where the backend serves the public pages' data, and the cache tags each
// answer depends on (ADR 0014, "Cache and purges"). The frontend caches
// each answer under its tags, so the purges the backend sends refresh it.

/**
 * Cache tags of the public pages, one per collection they show. Every page
 * is tagged with each collection it reads, so a change anywhere in a
 * collection refreshes every page that could show it. The site is small;
 * per-document tags would save renders but risk missing a dependency.
 */
export const PUBLIC_TAGS = {
  topics: "public:topics",
  individuals: "public:individuals",
  countries: "public:countries",
  categories: "public:categories",
  tags: "public:tags",
  snippets: "public:snippets",
  references: "public:references",
  media: "public:media",
} as const;
export type PublicTag = (typeof PUBLIC_TAGS)[keyof typeof PUBLIC_TAGS];

const T = PUBLIC_TAGS;

/** The collections each page's data reads. */
export const PAGE_DATA_TAGS = {
  home: [T.topics, T.countries],
  topic: [
    T.topics,
    T.individuals,
    T.countries,
    T.categories,
    T.tags,
    T.snippets,
    T.references,
    T.media,
  ],
  country: [T.countries, T.topics, T.individuals],
  individual: [
    T.individuals,
    T.topics,
    T.countries,
    T.snippets,
    T.media,
    T.references,
  ],
} as const satisfies Record<string, readonly PublicTag[]>;

/**
 * The path of a page's data. A value that is not a slug is refused, not
 * escaped: no page has one, and a path built from it, such as one with
 * "..", could reach another endpoint.
 */
function slugPath(prefix: string, slug: string): string {
  if (!isSlug(slug)) throw new Error("Page data is requested by slug only.");
  return `${prefix}/${slug}`;
}

export const PAGE_DATA_PATHS = {
  home: "/api/v1/pages/home",
  topic: (slug: string) => slugPath("/api/v1/pages/topics", slug),
  country: (slug: string) => slugPath("/api/v1/pages/countries", slug),
  individual: (slug: string) => slugPath("/api/v1/pages/individuals", slug),
} as const;

const RECORD_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Whether `value` is a record's id: Payload's ids here are UUIDs. */
export function isRecordId(value: string): boolean {
  return RECORD_ID.test(value);
}

/**
 * Where staff read a draft's page data (ADR 0014, live preview): by the
 * record's id, since a draft's slug may change or be taken, and never
 * cached. A value that is not an id is refused, as slugs are above.
 */
export const PREVIEW_PATHS = {
  topic: (id: string) => {
    if (!isRecordId(id)) throw new Error("Previews are requested by id only.");
    return `/api/v1/previews/topics/${id}`;
  },
} as const;
