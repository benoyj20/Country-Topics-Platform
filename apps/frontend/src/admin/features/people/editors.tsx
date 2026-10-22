import "server-only";

import { EMPTY_INVITATION } from "@countrytopics/contracts";

import {
  isAdmin,
  type EditedCollection,
  type Editor,
} from "@/admin/records/editor";

import { readInvitation, readUser } from "./backend";
import { InvitationForm, UserForm } from "./PeopleForms";

// The people feature's record pages, for the generic record page
// (app/(admin)/admin/collections/[collection]/[id]): a record's page,
// by its id, and a new record's, where staff may make one.

export const EDITORS = {
  users: {
    record: async (id, account, notice) => {
      const user = await readUser(id);
      return (
        user && {
          title: user.status.email,
          body: (
            <UserForm
              id={user.id}
              values={user.values}
              status={user.status}
              canEdit={isAdmin(account)}
              self={
                user.status.email.toLowerCase() === account.email.toLowerCase()
              }
              notice={notice}
            />
          ),
        }
      );
    },
  },
  invitations: {
    record: async (id, _account, notice) => {
      const invitation = await readInvitation(id);
      return (
        invitation && {
          title: invitation.values.email,
          body: (
            <InvitationForm
              id={invitation.id}
              values={invitation.values}
              status={invitation.status}
              notice={notice}
            />
          ),
        }
      );
    },
    create: () => (
      <InvitationForm id={null} values={EMPTY_INVITATION} status={null} />
    ),
  },
} satisfies Partial<Record<EditedCollection, Editor>>;
