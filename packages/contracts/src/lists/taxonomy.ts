import { type AdminLists, created, DEFAULT_LIMIT, text } from "./fields.ts";

// The taxonomy feature's lists in the admin (ADR 0015).

export const LISTS = {
  countries: {
    title: "name",
    fields: {
      name: text,
      code: text,
      isoName: text,
      region: text,
      subregion: text,
      ...created,
    },
    columns: ["name", "code", "region", "subregion"],
    search: ["name", "code", "isoName"],
    filters: { region: "contains", subregion: "contains" },
    defaultSort: "name",
    defaultLimit: 50,
    drafts: false,
    readers: "staff",
  },
  categories: {
    title: "name",
    fields: { name: text, slug: text, ...created },
    columns: ["name", "slug", "updatedAt"],
    search: ["name", "slug"],
    filters: {},
    defaultSort: "name",
    defaultLimit: DEFAULT_LIMIT,
    drafts: false,
    readers: "staff",
  },
  tags: {
    title: "name",
    fields: { name: text, slug: text, ...created },
    columns: ["name", "slug", "updatedAt"],
    search: ["name", "slug"],
    filters: {},
    defaultSort: "name",
    defaultLimit: DEFAULT_LIMIT,
    drafts: false,
    readers: "staff",
  },
} satisfies AdminLists;
