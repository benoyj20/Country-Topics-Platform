import type { AdminCollection } from "@countrytopics/contracts";
import {
  REFERENCE_CHECK_LABELS,
  REFERENCE_KIND_LABELS,
  type ReferenceCheckStatus,
} from "@countrytopics/domain";

import { DATE_FIELDS, type CollectionText } from "@/admin/collection-text";
import type { StatusTone } from "@/admin/status-tone";

// What the admin calls the references feature's collections, their fields,
// and their stored values, as Payload's panel does (apps/api/src/collections),
// and the colours its statuses show in. Read through admin/collections.ts.

export const COLLECTIONS = {
  references: {
    plural: "References",
    singular: "Reference",
    group: "Content",
    fields: {
      title: "Title",
      kind: "Kind",
      checkStatus: "Check",
      authors: "Authors",
      doi: "DOI",
      isbn: "ISBN",
      ...DATE_FIELDS,
    },
    values: {
      kind: REFERENCE_KIND_LABELS,
      checkStatus: REFERENCE_CHECK_LABELS,
    },
    tones: {
      checkStatus: {
        pending: "waiting",
        resolved: "good",
        not_found: "problem",
        failed: "problem",
      } satisfies Record<ReferenceCheckStatus, StatusTone>,
    },
  },
} satisfies Partial<Record<AdminCollection, CollectionText>>;
