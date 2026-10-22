import { type Role, ROLES } from "@countrytopics/domain";
import * as z from "zod";

import { personOf, Related, type RelatedRecord } from "./admin-lists.ts";
import {
  fieldOfTree,
  optionalText,
  type RecordDates,
  recordDates,
  recordSearchParams,
  storedText,
} from "./admin-records.ts";

// The admin's people (ADR 0014, phase 10): invitations, the allowlist an
// address must be on to make an account, with the role it gets; accounts,
// whose names and role admins change, and which they delete; and the audit
// log, which nobody changes. Admins only, except that staff read their own
// account.

export type InvitationValues = { email: string; role: Role; note: string };

/** Set by the backend only. */
export type InvitationStatus = RecordDates & {
  invitedBy: RelatedRecord | null;
  acceptedAt: string | null;
};

export type EditorInvitation = {
  id: string;
  values: InvitationValues;
  status: InvitationStatus;
};

export const EMPTY_INVITATION: InvitationValues = {
  email: "",
  role: "member",
  note: "",
};

/** The query string of `GET /api/invitations/<id>`, and of a save. */
export function invitationSearchParams(): URLSearchParams {
  return recordSearchParams([
    "email",
    "role",
    "note",
    "invitedBy",
    "acceptedAt",
    "createdAt",
    "updatedAt",
  ]);
}

export const storedInvitationSchema = z.looseObject({
  id: z.string(),
  email: z.string(),
  role: z.enum(ROLES),
  note: storedText,
  invitedBy: Related.nullish(),
  acceptedAt: storedText,
  ...recordDates,
});
export type StoredInvitation = z.infer<typeof storedInvitationSchema>;

export function editorInvitation(stored: StoredInvitation): EditorInvitation {
  return {
    id: stored.id,
    values: {
      email: stored.email,
      role: stored.role,
      note: stored.note ?? "",
    },
    status: {
      invitedBy: personOf(stored.invitedBy),
      acceptedAt: stored.acceptedAt ?? null,
      createdAt: stored.createdAt,
      updatedAt: stored.updatedAt,
    },
  };
}

/**
 * The JSON body of a save: `POST /api/invitations` for a new one, `PATCH`
 * for one that exists. The backend stores the address in lower case.
 */
export function invitationSaveBody(
  values: InvitationValues,
): Record<string, unknown> {
  return {
    email: values.email.trim(),
    role: values.role,
    note: optionalText(values.note),
  };
}

export function invitationFieldOf(path: string): string | null {
  return fieldOfTree({ email: true, role: true, note: true }, path);
}

export type UserValues = { name: string; displayName: string; role: Role };

/** Set by sign-in only. */
export type UserStatus = RecordDates & {
  email: string;
  /** The sign-in account; empty for one made before it, until it signs in. */
  authUserId: string | null;
};

export type EditorUser = { id: string; values: UserValues; status: UserStatus };

/** The query string of `GET /api/users/<id>`, and of a save. */
export function userSearchParams(): URLSearchParams {
  return recordSearchParams(
    [
      "email",
      "name",
      "displayName",
      "role",
      "authUserId",
      "createdAt",
      "updatedAt",
    ],
    { depth: 0 },
  );
}

export const storedUserSchema = z.looseObject({
  id: z.string(),
  email: z.string(),
  name: storedText,
  displayName: storedText,
  role: z.enum(ROLES),
  authUserId: storedText,
  ...recordDates,
});
export type StoredUser = z.infer<typeof storedUserSchema>;

export function editorUser(stored: StoredUser): EditorUser {
  return {
    id: stored.id,
    values: {
      name: stored.name ?? "",
      displayName: stored.displayName ?? "",
      role: stored.role,
    },
    status: {
      email: stored.email,
      authUserId: stored.authUserId ?? null,
      createdAt: stored.createdAt,
      updatedAt: stored.updatedAt,
    },
  };
}

/**
 * The JSON body of `PATCH /api/users/<id>`. An empty public name is
 * stored as none, so the member chooses one before commenting again.
 */
export function userSaveBody(values: UserValues): Record<string, unknown> {
  return {
    name: optionalText(values.name),
    displayName: optionalText(values.displayName),
    role: values.role,
  };
}

export function userFieldOf(path: string): string | null {
  return fieldOfTree({ name: true, displayName: true, role: true }, path);
}

/** The query string of `GET /api/audit-log/<id>`. */
export function auditEntrySearchParams(): URLSearchParams {
  return recordSearchParams(
    [
      "action",
      "actor",
      "targetCollection",
      "targetId",
      "details",
      "createdAt",
      "updatedAt",
    ],
    { depth: 1 },
  );
}

export const storedAuditEntrySchema = z.looseObject({
  id: z.string(),
  action: z.string(),
  actor: Related.nullish(),
  targetCollection: z.string(),
  targetId: z.string(),
  details: z.unknown(),
  ...recordDates,
});
export type StoredAuditEntry = z.infer<typeof storedAuditEntrySchema>;
