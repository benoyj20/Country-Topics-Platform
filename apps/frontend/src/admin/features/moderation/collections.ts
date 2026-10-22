import type { AdminCollection } from "@countrytopics/contracts";
import {
  COMMENT_REPORT_REASON_LABELS,
  COMMENT_REPORT_STATUS_LABELS,
  COMMENT_STATUS_LABELS,
  type CommentReportStatus,
  type CommentStatus,
  FEEDBACK_KIND_LABELS,
  FEEDBACK_STATUS_LABELS,
  type FeedbackStatus,
} from "@countrytopics/domain";

import { DATE_FIELDS, type CollectionText } from "@/admin/collection-text";
import type { StatusTone } from "@/admin/status-tone";

// What the admin calls the moderation feature's collections, their fields,
// and their stored values, as Payload's panel does (apps/api/src/collections),
// and the colours its statuses show in. Read through admin/collections.ts.

export const COLLECTIONS = {
  comments: {
    plural: "Comments",
    singular: "Comment",
    group: "Discussion",
    description:
      "Written by members on topic pages. Staff hide comments that break the rules and lock threads; the text itself cannot be edited.",
    fields: {
      body: "Comment",
      topic: "Topic",
      author: "Author",
      status: "Status",
      locked: "Thread locked",
      parent: "A reply",
      ...DATE_FIELDS,
    },
    values: { status: COMMENT_STATUS_LABELS },
    tones: {
      status: {
        visible: "good",
        hidden: "problem",
        removed: "problem",
        deleted: "plain",
      } satisfies Record<CommentStatus, StatusTone>,
    },
  },
  "comment-reports": {
    plural: "Comment reports",
    singular: "Comment report",
    group: "Discussion",
    description:
      "Sent by members from topic pages, open ones first. Open the comment to hide it, which marks its reports acted on, or dismiss a report that needs nothing done.",
    fields: {
      comment: "Comment",
      reason: "Reason",
      note: "Note",
      status: "Status",
      ...DATE_FIELDS,
    },
    values: {
      reason: COMMENT_REPORT_REASON_LABELS,
      status: COMMENT_REPORT_STATUS_LABELS,
    },
    tones: {
      status: {
        open: "waiting",
        dismissed: "plain",
        actioned: "good",
      } satisfies Record<CommentReportStatus, StatusTone>,
    },
  },
  feedback: {
    plural: "Feedback",
    singular: "Feedback",
    group: "Administration",
    description:
      "Sent by members from the Feedback link at the bottom of every page, new first.",
    fields: {
      message: "Message",
      kind: "Kind",
      page: "Page",
      status: "Status",
      author: "From",
      ...DATE_FIELDS,
    },
    values: { kind: FEEDBACK_KIND_LABELS, status: FEEDBACK_STATUS_LABELS },
    tones: {
      status: { new: "waiting", done: "good" } satisfies Record<
        FeedbackStatus,
        StatusTone
      >,
    },
  },
} satisfies Partial<Record<AdminCollection, CollectionText>>;
