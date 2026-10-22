import { LINK_ARCHIVE_STATUSES } from "@countrytopics/domain";

import {
  type AdminLists,
  created,
  date,
  DEFAULT_LIMIT,
  select,
  text,
} from "./fields.ts";

// The archives feature's lists in the admin (ADR 0015).

export const LISTS = {
  "link-archives": {
    title: "url",
    fields: {
      url: text,
      status: select(LINK_ARCHIVE_STATUSES),
      capturedAt: date,
      checkedAt: date,
      ...created,
    },
    columns: ["url", "status", "capturedAt", "checkedAt"],
    search: ["url"],
    filters: { status: "equals", checkedAt: "dates" },
    defaultSort: "-checkedAt",
    defaultLimit: DEFAULT_LIMIT,
    drafts: false,
    readers: "staff",
  },
} satisfies AdminLists;
