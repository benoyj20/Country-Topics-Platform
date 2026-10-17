import { revalidateTag } from "next/cache";
import { after } from "next/server";
import type {
  CollectionAfterChangeHook,
  CollectionAfterDeleteHook,
} from "payload";

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

/**
 * How long a public page or its data is served before it is rendered again,
 * even without a purge. It bounds how stale a page can be after changes the
 * site does not purge for: the worker's video and link checks, and edits
 * made outside a web request, such as scripts. Pages read it as a literal
 * (Next.js requires that); keep them equal.
 */
export const PUBLIC_REVALIDATE_S = 3600;

// The next visitor gets a fresh render instead of the stale page, so an
// admin who publishes and then opens the page sees the change.
const EXPIRE_NOW = { expire: 0 };

// Next.js's message for after() called outside a request (error E468).
const OUTSIDE_REQUEST = /outside a request scope/;

/**
 * Purges public pages once the response is sent. Payload commits a save
 * just before its route returns, while hooks run inside the transaction:
 * purging from the hook itself would let a visitor's request in between
 * render the old content again and cache it until the next purge.
 *
 * Outside a web request (a script using the local API) there is no page
 * cache to reach: the save goes ahead, and pages refresh within
 * PUBLIC_REVALIDATE_S.
 */
export function purgePublicPages(tags: Iterable<PublicTag>): void {
  const unique = [...new Set(tags)];
  if (unique.length === 0) return;
  try {
    after(() => {
      for (const tag of unique) revalidateTag(tag, EXPIRE_NOW);
    });
  } catch (error) {
    if (!(error instanceof Error && OUTSIDE_REQUEST.test(error.message))) {
      throw error;
    }
    console.warn(
      `Public pages not purged (${unique.join(", ")}): no web request. They refresh within ${PUBLIC_REVALIDATE_S / 60} minutes.`,
    );
  }
}

type ChangeHooks = {
  afterChange?: CollectionAfterChangeHook[];
  afterDelete?: CollectionAfterDeleteHook[];
};

/**
 * Adds hooks that purge the pages showing a collection after any change to
 * it, to the collection's other after-change and after-delete hooks.
 */
export function purgeOnChange<T extends ChangeHooks>(
  tag: PublicTag,
  hooks: T,
): T & Required<ChangeHooks> {
  const purge = () => purgePublicPages([tag]);
  return {
    ...hooks,
    afterChange: [...(hooks.afterChange ?? []), purge],
    afterDelete: [...(hooks.afterDelete ?? []), purge],
  };
}
