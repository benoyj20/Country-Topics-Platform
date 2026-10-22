import "server-only";

import { type EditedCollection, type Editor } from "@/admin/records/editor";

import { AuditEntryView } from "./AuditEntryView";
import { readAuditEntry } from "./backend";

// The audit feature's record pages, for the generic record page
// (app/(admin)/admin/collections/[collection]/[id]): a record's page,
// by its id, and a new record's, where staff may make one.

export const EDITORS = {
  "audit-log": {
    record: async (id) => {
      const entry = await readAuditEntry(id);
      return (
        entry && { title: entry.action, body: <AuditEntryView entry={entry} /> }
      );
    },
  },
} satisfies Partial<Record<EditedCollection, Editor>>;
