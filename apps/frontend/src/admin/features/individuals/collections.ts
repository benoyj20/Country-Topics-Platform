import type { AdminCollection } from "@countrytopics/contracts";

import { DATE_FIELDS, type CollectionText } from "@/admin/collection-text";

// What the admin calls the individuals feature's collections, their fields,
// and their stored values, as Payload's panel does (apps/api/src/collections),
// and the colours its statuses show in. Read through admin/collections.ts.

export const COLLECTIONS = {
  individuals: {
    plural: "Individuals",
    singular: "Individual",
    group: "Content",
    fields: {
      name: "Name",
      summary: "Role or description",
      wikidataId: "Wikidata ID",
      ...DATE_FIELDS,
    },
  },
} satisfies Partial<Record<AdminCollection, CollectionText>>;
