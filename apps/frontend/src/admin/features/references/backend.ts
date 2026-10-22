import "server-only";

import {
  editorReference,
  referenceSearchParams,
  storedReferenceSchema,
} from "@countrytopics/contracts";

import { readRecord } from "@/admin/records/backend";

// The references feature's reads for its editors, from Payload's REST API
// as the staff member, with the query a save is answered with.

export async function readReference(id: string) {
  const stored = await readRecord(
    "references",
    id,
    referenceSearchParams(),
    storedReferenceSchema,
  );
  return stored && editorReference(stored);
}
