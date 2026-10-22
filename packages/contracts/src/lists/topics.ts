import { TOPIC_CHANGE_KINDS, TOPIC_STATES } from "@countrytopics/domain";

import {
  type AdminLists,
  boolean,
  created,
  DEFAULT_LIMIT,
  select,
  text,
  to,
} from "./fields.ts";

// The topics feature's lists in the admin (ADR 0015).

export const LISTS = {
  topics: {
    title: "title",
    fields: {
      title: text,
      summary: text,
      state: select(TOPIC_STATES),
      countries: to("countries", true),
      category: to("categories"),
      tags: to("tags", true),
      readyForReview: boolean,
      archived: boolean,
      ...created,
    },
    columns: ["title", "state", "countries", "updatedAt"],
    search: ["title", "summary"],
    filters: {
      state: "equals",
      countries: "related",
      category: "related",
      tags: "related",
      readyForReview: "equals",
      archived: "equals",
      updatedAt: "dates",
    },
    defaultSort: "-updatedAt",
    defaultLimit: DEFAULT_LIMIT,
    drafts: true,
    readers: "staff",
  },
  "topic-changes": {
    title: "note",
    fields: {
      topic: to("topics"),
      kind: select(TOPIC_CHANGE_KINDS),
      note: text,
      actor: to("users"),
      ...created,
    },
    columns: ["topic", "kind", "note", "createdAt"],
    search: ["note"],
    filters: {
      topic: "related",
      kind: "equals",
      actor: "related",
      createdAt: "dates",
    },
    defaultSort: "-createdAt",
    defaultLimit: DEFAULT_LIMIT,
    drafts: false,
    readers: "staff",
  },
} satisfies AdminLists;
