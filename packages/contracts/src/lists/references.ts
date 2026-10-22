import {
  REFERENCE_CHECK_STATUSES,
  REFERENCE_KINDS,
} from "@countrytopics/domain";

import {
  type AdminLists,
  created,
  DEFAULT_LIMIT,
  select,
  text,
} from "./fields.ts";

// The references feature's lists in the admin (ADR 0015).

export const LISTS = {
  references: {
    title: "title",
    fields: {
      title: text,
      kind: select(REFERENCE_KINDS),
      checkStatus: select(REFERENCE_CHECK_STATUSES),
      authors: text,
      doi: text,
      isbn: text,
      ...created,
    },
    columns: ["title", "kind", "checkStatus", "updatedAt"],
    search: ["title", "authors", "doi", "isbn"],
    filters: { kind: "equals", checkStatus: "equals", updatedAt: "dates" },
    defaultSort: "-updatedAt",
    defaultLimit: DEFAULT_LIMIT,
    drafts: false,
    readers: "staff",
  },
} satisfies AdminLists;
