import type { AdminCollection } from "@countrytopics/contracts";
import { LICENCE_LABELS } from "@countrytopics/domain";

import { DATE_FIELDS, type CollectionText } from "@/admin/collection-text";

// What the admin calls the media feature's collections, their fields,
// and their stored values, as Payload's panel does (apps/api/src/collections),
// and the colours its statuses show in. Read through admin/collections.ts.

export const COLLECTIONS = {
  media: {
    plural: "Files",
    singular: "File",
    group: "Content",
    description:
      "Documents and images used as evidence, and photos of individuals. Record the licence of every file.",
    fields: {
      filename: "File",
      alt: "Description",
      licence: "Licence",
      credit: "Credit",
      mimeType: "Type",
      ...DATE_FIELDS,
    },
    values: {
      licence: LICENCE_LABELS,
      mimeType: {
        "image/jpeg": "JPEG image",
        "image/png": "PNG image",
        "image/webp": "WebP image",
        "application/pdf": "PDF document",
      },
    },
  },
} satisfies Partial<Record<AdminCollection, CollectionText>>;
