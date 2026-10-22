import "server-only";

import {
  countrySearchParams,
  editorCountry,
  editorTerm,
  storedCountrySchema,
  storedTermSchema,
  type TermCollection,
  termSearchParams,
} from "@countrytopics/contracts";

import { readRecord } from "@/admin/records/backend";

// The taxonomy feature's reads for its editors, from Payload's REST API
// as the staff member, with the query a save is answered with.

export async function readCountry(id: string) {
  const stored = await readRecord(
    "countries",
    id,
    countrySearchParams(),
    storedCountrySchema,
  );
  return stored && editorCountry(stored);
}

export async function readTerm(collection: TermCollection, id: string) {
  const stored = await readRecord(
    collection,
    id,
    termSearchParams(collection),
    storedTermSchema,
  );
  return stored && editorTerm(stored);
}
