import "server-only";

import {
  auditEntrySearchParams,
  storedAuditEntrySchema,
} from "@countrytopics/contracts";

import { readRecord } from "@/admin/records/backend";

// The audit feature's reads for its editors, from Payload's REST API
// as the staff member, with the query a save is answered with.

export function readAuditEntry(id: string) {
  return readRecord(
    "audit-log",
    id,
    auditEntrySearchParams(),
    storedAuditEntrySchema,
  );
}
