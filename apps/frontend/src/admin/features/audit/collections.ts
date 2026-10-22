import type { AdminCollection } from "@countrytopics/contracts";

import { DATE_FIELDS, type CollectionText } from "@/admin/collection-text";

// What the admin calls the audit feature's collections, their fields,
// and their stored values, as Payload's panel does (apps/api/src/collections),
// and the colours its statuses show in. Read through admin/collections.ts.

export const COLLECTIONS = {
  "audit-log": {
    plural: "Audit log",
    singular: "Audit entry",
    group: "Administration",
    fields: {
      action: "Action",
      actor: "By",
      targetCollection: "Collection",
      targetId: "Record",
      ...DATE_FIELDS,
    },
  },
} satisfies Partial<Record<AdminCollection, CollectionText>>;
