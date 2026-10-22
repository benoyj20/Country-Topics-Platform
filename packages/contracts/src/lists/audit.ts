import { type AdminLists, created, DEFAULT_LIMIT, text, to } from "./fields.ts";

// The audit feature's lists in the admin (ADR 0015).

export const LISTS = {
  "audit-log": {
    title: "action",
    fields: {
      action: text,
      actor: to("users"),
      targetCollection: text,
      targetId: text,
      ...created,
    },
    columns: ["action", "actor", "targetCollection", "targetId", "createdAt"],
    search: ["action", "targetCollection", "targetId"],
    filters: {
      actor: "related",
      targetCollection: "contains",
      createdAt: "dates",
    },
    defaultSort: "-createdAt",
    defaultLimit: DEFAULT_LIMIT,
    drafts: false,
    readers: "admins",
  },
} satisfies AdminLists;
