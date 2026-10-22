import "server-only";

import {
  editorIndividual,
  individualSearchParams,
  storedIndividualSchema,
} from "@countrytopics/contracts";

import { readRecord } from "@/admin/records/backend";

// The individuals feature's reads for its editors, from Payload's REST API
// as the staff member, with the query a save is answered with.

export async function readIndividual(id: string) {
  const stored = await readRecord(
    "individuals",
    id,
    individualSearchParams(),
    storedIndividualSchema,
  );
  return stored && editorIndividual(stored);
}
