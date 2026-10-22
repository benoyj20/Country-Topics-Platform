"use client";

import {
  editorInvitation,
  editorUser,
  invitationFieldOf,
  invitationSaveBody,
  invitationSearchParams,
  type InvitationStatus,
  type InvitationValues,
  storedInvitationSchema,
  storedUserSchema,
  userFieldOf,
  userSaveBody,
  userSearchParams,
  type UserStatus,
  type UserValues,
} from "@countrytopics/contracts";
import {
  DISPLAY_NAME_MAX_LENGTH,
  ROLE_LABELS,
  ROLES,
} from "@countrytopics/domain";

import { formatDateTime } from "@/format";

import type { FieldTexts } from "../field-text";
import { personName } from "../record-name";
import { deleteRecord, saveRecord } from "../write";
import { SelectInput, TextArea, TextInput } from "./inputs";
import { RecordForm } from "./RecordForm";

// The people editors, as Payload's panel edits them
// (apps/api/src/collections/Invitations.ts, Users.ts): the invitations an
// address needs to make an account, and accounts' names and roles. Admins
// only; staff read their own account. Sign-in itself is Better Auth's.

const ROLE_OPTIONS = ROLES.map((value) => ({
  value,
  label: ROLE_LABELS[value],
}));

const INVITATION_TEXTS: FieldTexts = {
  email: {
    label: "Email",
    description:
      "The address may make an account, and gets the role below when it does.",
  },
  role: { label: "Role" },
  note: { label: "Note", description: "For staff: who they are, and why." },
};

export function InvitationForm({
  id,
  values,
  status,
  notice,
}: {
  id: string | null;
  values: InvitationValues;
  status: InvitationStatus | null;
  notice?: string;
}) {
  return (
    <RecordForm
      id={id}
      values={values}
      status={status}
      noun="invitation"
      collection="invitations"
      canEdit
      canDelete
      deleteQuestion="Delete this invitation? The address can no longer make an account; an account it already made stays."
      readOnlyNotice=""
      notice={notice}
      texts={INVITATION_TEXTS}
      order={Object.keys(INVITATION_TEXTS)}
      saveBody={invitationSaveBody}
      save={(saving, sent) =>
        saveRecord(
          {
            collection: "invitations",
            id: saving,
            query: invitationSearchParams(),
            body: invitationSaveBody(sent),
            fieldOf: invitationFieldOf,
            schema: storedInvitationSchema,
          },
          editorInvitation,
        )
      }
      remove={(removing) =>
        deleteRecord("invitations", removing, invitationFieldOf)
      }
      details={(current) => ({
        rows: [
          [
            "Invited by",
            current.invitedBy
              ? personName(current.invitedBy, { admin: true, staff: true })
              : "The system, or an account deleted since",
          ],
          [
            "Accepted",
            current.acceptedAt ? formatDateTime(current.acceptedAt) : "Not yet",
          ],
        ],
      })}
    >
      {(form) => (
        <>
          <TextInput form={form} name="email" required large />
          <SelectInput
            form={form}
            name="role"
            options={ROLE_OPTIONS}
            required
          />
          <TextArea form={form} name="note" />
        </>
      )}
    </RecordForm>
  );
}

const USER_TEXTS: FieldTexts = {
  name: { label: "Name", description: "From sign-in; staff see it only." },
  displayName: {
    label: "Public name",
    description: "Shown publicly with the person's comments.",
  },
  role: {
    label: "Role",
    description:
      "Moderators and admins sign in with an authenticator app before they open the admin.",
  },
};

export function UserForm({
  id,
  values,
  status,
  canEdit,
  self,
  notice,
}: {
  id: string;
  values: UserValues;
  status: UserStatus;
  /** Admins edit accounts; staff read their own. */
  canEdit: boolean;
  /** Whether it is the reader's own account. */
  self: boolean;
  notice?: string;
}) {
  return (
    <RecordForm
      id={id}
      values={values}
      status={status}
      noun="account"
      collection="users"
      canEdit={canEdit}
      // An admin's own account is deleted by another admin.
      canDelete={!self}
      deleteQuestion="Delete this account? Its comments' text is erased, its notifications and feedback are deleted, and it is signed out everywhere. It cannot be undone, and the person needs a new invitation to come back."
      readOnlyNotice="This is your account. Only admins change accounts."
      notice={notice}
      texts={USER_TEXTS}
      order={Object.keys(USER_TEXTS)}
      saveBody={userSaveBody}
      save={(saving, sent) =>
        saveRecord(
          {
            collection: "users",
            id: saving,
            query: userSearchParams(),
            body: userSaveBody(sent),
            fieldOf: userFieldOf,
            schema: storedUserSchema,
          },
          editorUser,
        )
      }
      confirmSave={(sent) =>
        self && sent.role !== "admin"
          ? "Change your own role? You can no longer change accounts or open what only admins open."
          : null
      }
      remove={(removing) => deleteRecord("users", removing, userFieldOf)}
      details={(current) => ({
        rows: [
          ["Email", current.email],
          [
            "Sign-in account",
            current.authUserId ? "Linked" : "Linked at their next sign-in",
          ],
        ],
      })}
    >
      {(form) => (
        <>
          <TextInput form={form} name="name" />
          <TextInput
            form={form}
            name="displayName"
            maxLength={DISPLAY_NAME_MAX_LENGTH}
          />
          <SelectInput
            form={form}
            name="role"
            options={ROLE_OPTIONS}
            required
          />
        </>
      )}
    </RecordForm>
  );
}
