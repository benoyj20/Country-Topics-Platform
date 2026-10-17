import {
  COMMENT_REPORT_NOTE_MAX_LENGTH,
  COMMENT_REPORT_REASONS,
} from "@countrytopics/domain";
import type { CollectionConfig } from "payload";

import { nobody, verifiedStaffOnly } from "@/access";
import { COMMENT_REPORT_REASON_LABELS } from "@/content-labels";

// A member's report that a comment breaks the rules, at most one per member
// and comment. Staff read them here; acting on them (hiding, dismissing)
// comes with moderation (MVP week 10). Reporting changes nothing a visitor
// sees.
export const CommentReports: CollectionConfig = {
  slug: "comment-reports",
  labels: { singular: "Comment report", plural: "Comment reports" },
  admin: {
    group: "Discussion",
    useAsTitle: "reason",
    defaultColumns: ["comment", "reason", "note", "createdAt"],
    description:
      "Sent by members from topic pages. Read-only here; moderation tools come later.",
  },
  defaultSort: "-createdAt",
  access: {
    read: verifiedStaffOnly,
    create: nobody,
    update: nobody,
    delete: nobody,
  },
  indexes: [{ fields: ["comment", "reporter"], unique: true }],
  fields: [
    {
      name: "comment",
      type: "relationship",
      relationTo: "comments",
      required: true,
    },
    {
      // Optional so that deleting an account keeps its reports for review.
      name: "reporter",
      type: "relationship",
      relationTo: "users",
      index: true,
    },
    {
      name: "reason",
      type: "select",
      required: true,
      options: COMMENT_REPORT_REASONS.map((value) => ({
        value,
        label: COMMENT_REPORT_REASON_LABELS[value],
      })),
    },
    {
      name: "note",
      type: "textarea",
      maxLength: COMMENT_REPORT_NOTE_MAX_LENGTH,
    },
  ],
};
