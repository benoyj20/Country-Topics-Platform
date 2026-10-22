import "server-only";

import { EMPTY_REFERENCE } from "@countrytopics/contracts";

import {
  isAdmin,
  type EditedCollection,
  type Editor,
} from "@/admin/records/editor";

import { readReference } from "./backend";
import { ReferenceForm } from "./ReferenceForm";

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
    create: () => (
      <ReferenceForm id={null} values={EMPTY_REFERENCE} status={null} canEdit />
    ),
  },
} satisfies Partial<Record<EditedCollection, Editor>>;
