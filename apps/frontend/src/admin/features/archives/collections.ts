import type { AdminCollection } from "@countrytopics/contracts";
import {
  LINK_ARCHIVE_STATUS_LABELS,
  type LinkArchiveStatus,
} from "@countrytopics/domain";

import { DATE_FIELDS, type CollectionText } from "@/admin/collection-text";
import type { StatusTone } from "@/admin/status-tone";

// What the admin calls the archives feature's collections, their fields,
// and their stored values, as Payload's panel does (apps/api/src/collections),
// and the colours its statuses show in. Read through admin/collections.ts.

export const COLLECTIONS = {
  "link-archives": {
    plural: "Archived links",
    singular: "Archived link",
    group: "Content",
    description:
      "Filled in by the worker: copies of evidence links and reference links in the Wayback Machine.",
    fields: {
      url: "Link",
      status: "Status",
      capturedAt: "Copy taken",
      checkedAt: "Checked",
      ...DATE_FIELDS,
    },
    values: { status: LINK_ARCHIVE_STATUS_LABELS },
    tones: {
      status: {
        archived: "good",
        not_archived: "plain",
        failed: "problem",
      } satisfies Record<LinkArchiveStatus, StatusTone>,
    },
  },
} satisfies Partial<Record<AdminCollection, CollectionText>>;
