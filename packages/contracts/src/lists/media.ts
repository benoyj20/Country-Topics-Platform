import { LICENCES, MEDIA_MIME_TYPES } from "@countrytopics/domain";

import {
  type AdminLists,
  created,
  DEFAULT_LIMIT,
  select,
  text,
} from "./fields.ts";

// The media feature's lists in the admin (ADR 0015).

export const LISTS = {
  media: {
    title: "alt",
    fields: {
      filename: text,
      alt: text,
      licence: select(LICENCES),
      credit: text,
      mimeType: select(MEDIA_MIME_TYPES),
      ...created,
    },
    columns: ["filename", "alt", "licence", "updatedAt"],
    search: ["alt", "filename", "credit"],
    filters: { licence: "equals", mimeType: "equals", updatedAt: "dates" },
    defaultSort: "-createdAt",
    defaultLimit: DEFAULT_LIMIT,
    drafts: false,
    readers: "staff",
    extra: ["mimeType", "url"],
  },
} satisfies AdminLists;
