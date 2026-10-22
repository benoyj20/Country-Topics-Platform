import { VIDEO_CHECK_STATUSES } from "@countrytopics/domain";

import {
  type AdminLists,
  created,
  date,
  DEFAULT_LIMIT,
  number,
  select,
  text,
  to,
} from "./fields.ts";

// The snippets feature's lists in the admin (ADR 0015).

export const LISTS = {
  snippets: {
    title: "caption",
    fields: {
      caption: text,
      transcriptText: text,
      speaker: to("individuals"),
      video: to("videos"),
      language: text,
      ...created,
    },
    columns: ["caption", "speaker", "video", "updatedAt"],
    search: ["caption", "transcriptText"],
    filters: { speaker: "related", video: "related", language: "contains" },
    defaultSort: "-updatedAt",
    defaultLimit: DEFAULT_LIMIT,
    drafts: false,
    readers: "staff",
  },
  videos: {
    title: "title",
    fields: {
      title: text,
      channel: text,
      youtubeId: text,
      checkStatus: select(VIDEO_CHECK_STATUSES),
      durationS: number,
      checkedAt: date,
      ...created,
    },
    columns: ["title", "channel", "checkStatus", "durationS", "checkedAt"],
    search: ["title", "channel", "youtubeId"],
    filters: { checkStatus: "equals", checkedAt: "dates" },
    defaultSort: "-updatedAt",
    defaultLimit: DEFAULT_LIMIT,
    drafts: false,
    readers: "staff",
  },
} satisfies AdminLists;
