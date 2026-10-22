import "server-only";

import { EMPTY_TERM } from "@countrytopics/contracts";

import {
  isAdmin,
  type EditedCollection,
  type Editor,
} from "@/admin/records/editor";

import { readCountry, readTerm } from "./backend";
import { CountryForm, TermForm } from "./TaxonomyForms";

// The taxonomy feature's record pages, for the generic record page
// (app/(admin)/admin/collections/[collection]/[id]): a record's page,
// by its id, and a new record's, where staff may make one.

function termEditor(collection: "categories" | "tags"): Editor {
  return {
    record: async (id, account, notice) => {
      const term = await readTerm(collection, id);
      return (
        term && {
          title: term.values.name,
          body: (
            <TermForm
              collection={collection}
              id={term.id}
              values={term.values}
              status={term.status}
              canEdit={isAdmin(account)}
              notice={notice}
            />
          ),
        }
      );
    },
    create: () => (
      <TermForm
        collection={collection}
        id={null}
        values={EMPTY_TERM}
        status={null}
        canEdit
      />
    ),
  };
}

export const EDITORS = {
  countries: {
    record: async (id, account, notice) => {
      const country = await readCountry(id);
      return (
        country && {
          title: country.values.name,
          body: (
            <CountryForm
              id={country.id}
              values={country.values}
              codes={country.codes}
              status={country.status}
              canEdit={isAdmin(account)}
              notice={notice}
            />
          ),
        }
      );
    },
  },
  categories: termEditor("categories"),
  tags: termEditor("tags"),
} satisfies Partial<Record<EditedCollection, Editor>>;
