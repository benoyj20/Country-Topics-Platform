import type { AdminCollection } from "@countrytopics/contracts";

import { DATE_FIELDS, type CollectionText } from "@/admin/collection-text";

// What the admin calls the taxonomy feature's collections, their fields,
// and their stored values, as Payload's panel does (apps/api/src/collections),
// and the colours its statuses show in. Read through admin/collections.ts.

export const COLLECTIONS = {
  countries: {
    plural: "Countries",
    singular: "Country",
    group: "Content",
    fields: {
      name: "Name",
      code: "ISO 3166-1 alpha-2",
      isoName: "ISO short name",
      region: "Region",
      subregion: "Subregion",
      ...DATE_FIELDS,
    },
  },
  categories: {
    plural: "Categories",
    singular: "Category",
    group: "Content",
    fields: { name: "Name", slug: "Slug", ...DATE_FIELDS },
  },
  tags: {
    plural: "Tags",
    singular: "Tag",
    group: "Content",
    fields: { name: "Name", slug: "Slug", ...DATE_FIELDS },
  },
} satisfies Partial<Record<AdminCollection, CollectionText>>;
