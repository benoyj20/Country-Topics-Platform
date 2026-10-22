import * as z from "zod";

import { PUBLIC_TAGS } from "./endpoints.ts";

// The worker's purge of the site's cache (ADR 0014, "Cache and purges"):
// once the backend has purged its own cache, the worker sends the same
// tags here, signed with the purge key (@countrytopics/forwarding).

/** Where the site takes purges. The pass-through never passes it on. */
export const PURGE_PATH = "/api/revalidate";

const PUBLIC_TAG_VALUES = Object.values(PUBLIC_TAGS);

/** POST /api/revalidate: the tags to purge, each named once. */
export const PurgeRequest = z.strictObject({
  tags: z
    .array(z.enum(PUBLIC_TAG_VALUES))
    .min(1)
    .refine((tags) => new Set(tags).size === tags.length, {
      message: "Each tag is named once.",
    }),
});
export type PurgeRequest = z.infer<typeof PurgeRequest>;

/** The largest purge body the site reads: every tag, with room to spare. */
export const PURGE_BODY_MAX_BYTES = 1024;

/** The site's answer to a purge it carried out. */
export const PurgeAnswer = z.strictObject({
  purged: PurgeRequest.shape.tags,
});
export type PurgeAnswer = z.infer<typeof PurgeAnswer>;
