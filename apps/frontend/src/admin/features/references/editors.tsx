import "server-only";

import {
  isAdmin,
  type EditedCollection,
  type Editor,
} from "@/admin/records/editor";

import { readReference } from "./backend";
import { ReferenceForm } from "./ReferenceForm";
import { NewReference } from "./new-records";

// The references feature's record pages, for the generic record page
// (app/(admin)/admin/collections/[collection]/[id]): a record's page,
// by its id, and a new record's, where staff may make one.

export const EDITORS = {
  references: {
    record: async (id, account, notice) => {
      const reference = await readReference(id);
      return (
        reference && {
          title: reference.values.title,
          body: (
            <ReferenceForm
              id={reference.id}
              values={reference.values}
              status={reference.status}
              canEdit={isAdmin(account)}
              notice={notice}
            />
          ),
        }
      );
    },
    create: () => <NewReference />,
  },
} satisfies Partial<Record<EditedCollection, Editor>>;
