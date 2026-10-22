import "server-only";

import { EMPTY_INDIVIDUAL } from "@countrytopics/contracts";

import {
  isAdmin,
  type EditedCollection,
  type Editor,
} from "@/admin/records/editor";

import { readIndividual } from "./backend";
import { IndividualForm } from "./IndividualForm";

// The individuals feature's record pages, for the generic record page
// (app/(admin)/admin/collections/[collection]/[id]): a record's page,
// by its id, and a new record's, where staff may make one.

export const EDITORS = {
  individuals: {
    record: async (id, account, notice) => {
      const individual = await readIndividual(id);
      return (
        individual && {
          title: individual.values.name,
          body: (
            <IndividualForm
              id={individual.id}
              values={individual.values}
              status={individual.status}
              canEdit={isAdmin(account)}
              notice={notice}
            />
          ),
        }
      );
    },
    create: () => (
      <IndividualForm
        id={null}
        values={EMPTY_INDIVIDUAL}
        status={null}
        canEdit
      />
    ),
  },
} satisfies Partial<Record<EditedCollection, Editor>>;
