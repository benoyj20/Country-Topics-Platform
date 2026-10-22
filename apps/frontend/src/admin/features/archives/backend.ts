import "server-only";

import {
  linkArchiveSearchParams,
  storedLinkArchiveSchema,
} from "@countrytopics/contracts";

import { readRecord } from "@/admin/records/backend";

// The archives feature's reads for its editors, from Payload's REST API
// as the staff member, with the query a save is answered with.

export function readLinkArchive(id: string) {
  return readRecord(
    "link-archives",
    id,
    linkArchiveSearchParams(),
    storedLinkArchiveSchema,
  );
}
