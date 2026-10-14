import { isSlug, SLUG_MAX_LENGTH, slugify } from "@countrytopics/domain";
import type {
  CollectionBeforeValidateHook,
  CollectionSlug,
  TextField,
} from "payload";

const MAX_SUFFIX = 50;

/** The `slug` field: unique, indexed, and filled from the name when left empty. */
export const slugField: TextField = {
  name: "slug",
  type: "text",
  required: true,
  unique: true,
  index: true,
  maxLength: SLUG_MAX_LENGTH,
  validate: (value: unknown) =>
    typeof value === "string" && isSlug(value)
      ? true
      : "Use lowercase letters, digits, and single hyphens, like public-health.",
  admin: {
    position: "sidebar",
    description:
      "Used in links. Filled from the name when left empty; changing it later breaks old links.",
  },
};

/**
 * Fills an empty slug from `sourceField`, adding `-2`, `-3`, … when that slug is
 * taken. A typed slug is kept as it is and must be unique.
 */
export function fillSlug(
  collection: CollectionSlug,
  sourceField = "name",
): CollectionBeforeValidateHook {
  return async ({ data, originalDoc, req }) => {
    if (!data || data.slug || originalDoc?.slug) return data;
    const source = data[sourceField];
    const base = typeof source === "string" ? slugify(source) : "";
    if (!base) return data;
    for (let n = 1; n <= MAX_SUFFIX; n++) {
      const suffix = n === 1 ? "" : `-${n}`;
      const candidate =
        base.slice(0, SLUG_MAX_LENGTH - suffix.length).replace(/-+$/, "") +
        suffix;
      const { totalDocs } = await req.payload.count({
        collection,
        where: { slug: { equals: candidate } },
        overrideAccess: true,
        req,
      });
      if (totalDocs === 0) return { ...data, slug: candidate };
    }
    // Every candidate is taken; the required-field check asks for a slug.
    return data;
  };
}
