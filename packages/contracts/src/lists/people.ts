import { ROLES } from "@countrytopics/domain";

import {
  type AdminLists,
  created,
  date,
  DEFAULT_LIMIT,
  select,
  text,
} from "./fields.ts";

// The people feature's lists in the admin (ADR 0015).

export const LISTS = {
  users: {
    title: "email",
    fields: {
      email: text,
      name: text,
      displayName: text,
      role: select(ROLES),
      ...created,
    },
    columns: ["email", "name", "role", "createdAt"],
    search: ["email", "name", "displayName"],
    filters: { role: "equals", createdAt: "dates" },
    defaultSort: "-createdAt",
    defaultLimit: DEFAULT_LIMIT,
    drafts: false,
    // Everyone reads their own account; admins read all of them.
    readers: "staff",
  },
  invitations: {
    title: "email",
    fields: {
      email: text,
      role: select(ROLES),
      acceptedAt: date,
      ...created,
    },
    columns: ["email", "role", "acceptedAt", "createdAt"],
    search: ["email"],
    filters: { role: "equals", acceptedAt: "exists", createdAt: "dates" },
    defaultSort: "-createdAt",
    defaultLimit: DEFAULT_LIMIT,
    drafts: false,
    readers: "admins",
  },
} satisfies AdminLists;
