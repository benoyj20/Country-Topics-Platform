import { type AdminLists, created, DEFAULT_LIMIT, text } from "./fields.ts";

// The individuals feature's lists in the admin (ADR 0015).

export const LISTS = {
  individuals: {
    title: "name",
    fields: {
      name: text,
      summary: text,
      wikidataId: text,
      ...created,
    },
    columns: ["name", "summary", "updatedAt"],
    search: ["name", "summary"],
    filters: { wikidataId: "exists", updatedAt: "dates" },
    defaultSort: "name",
    defaultLimit: DEFAULT_LIMIT,
    drafts: false,
    readers: "staff",
  },
} satisfies AdminLists;
