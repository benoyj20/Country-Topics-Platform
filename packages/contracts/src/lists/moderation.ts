import {
  COMMENT_REPORT_REASONS,
  COMMENT_REPORT_STATUSES,
  COMMENT_STATUSES,
  FEEDBACK_KINDS,
  FEEDBACK_STATUSES,
} from "@countrytopics/domain";

import {
  type AdminLists,
  boolean,
  created,
  DEFAULT_LIMIT,
  select,
  text,
  to,
} from "./fields.ts";

// The moderation feature's lists in the admin (ADR 0015).

export const LISTS = {
  comments: {
    title: "body",
    fields: {
      body: text,
      topic: to("topics"),
      author: to("users"),
      status: select(COMMENT_STATUSES),
      locked: boolean,
      parent: to("comments"),
      ...created,
    },
    columns: ["body", "topic", "author", "status", "createdAt"],
    search: ["body"],
    filters: {
      status: "equals",
      topic: "related",
      author: "related",
      locked: "equals",
      parent: "exists",
      createdAt: "dates",
    },
    defaultSort: "-createdAt",
    defaultLimit: DEFAULT_LIMIT,
    drafts: false,
    readers: "staff",
  },
  "comment-reports": {
    title: "reason",
    fields: {
      comment: to("comments"),
      reason: select(COMMENT_REPORT_REASONS),
      note: text,
      status: select(COMMENT_REPORT_STATUSES),
      ...created,
    },
    columns: ["comment", "reason", "note", "status", "createdAt"],
    search: ["note"],
    filters: {
      status: "equals",
      reason: "equals",
      comment: "related",
      createdAt: "dates",
    },
    defaultSort: "status,-createdAt",
    defaultLimit: DEFAULT_LIMIT,
    drafts: false,
    readers: "staff",
  },
  feedback: {
    title: "message",
    fields: {
      message: text,
      kind: select(FEEDBACK_KINDS),
      page: text,
      status: select(FEEDBACK_STATUSES),
      author: to("users"),
      ...created,
    },
    columns: ["message", "kind", "page", "status", "createdAt"],
    search: ["message", "page"],
    filters: {
      status: "equals",
      kind: "equals",
      author: "related",
      createdAt: "dates",
    },
    defaultSort: "status,-createdAt",
    defaultLimit: DEFAULT_LIMIT,
    drafts: false,
    readers: "staff",
  },
} satisfies AdminLists;
