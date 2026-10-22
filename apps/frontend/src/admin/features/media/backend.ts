import "server-only";

import {
  editorMedia,
  mediaSearchParams,
  storedMediaSchema,
} from "@countrytopics/contracts";

import { readRecord } from "@/admin/records/backend";

// The media feature's reads for its editors, from Payload's REST API
// as the staff member, with the query a save is answered with.

export async function readMedia(id: string) {
  const stored = await readRecord(
    "media",
    id,
    mediaSearchParams(),
    storedMediaSchema,
  );
  return stored && editorMedia(stored);
}
