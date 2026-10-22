import "server-only";

import {
  editorInvitation,
  editorUser,
  invitationSearchParams,
  storedInvitationSchema,
  storedUserSchema,
  userSearchParams,
} from "@countrytopics/contracts";

import { readRecord } from "@/admin/records/backend";

// The people feature's reads for its editors, from Payload's REST API
// as the staff member, with the query a save is answered with.

export async function readInvitation(id: string) {
  const stored = await readRecord(
    "invitations",
    id,
    invitationSearchParams(),
    storedInvitationSchema,
  );
  return stored && editorInvitation(stored);
}

export async function readUser(id: string) {
  const stored = await readRecord(
    "users",
    id,
    userSearchParams(),
    storedUserSchema,
  );
  return stored && editorUser(stored);
}
