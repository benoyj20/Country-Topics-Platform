import {
  COMMENT_REPORT_NOTE_MAX_LENGTH,
  COMMENT_REPORT_REASON_LABELS,
  COMMENT_REPORT_REASONS,
  COMMENT_REPORT_STATUS_LABELS,
  COMMENT_REPORT_STATUSES,
} from "@countrytopics/domain";
import type { CollectionConfig } from "payload";

import { nobody, readOnlyField, verifiedStaffOnly } from "@/access";
import { auditHooks } from "@/audit";

// A member's report that a comment breaks the rules, at most one per member
// and comment. Staff work through the open ones: hiding the comment marks
// its reports "acted on", and a report that needs nothing done is dismissed
// (ADR 0010). Reporting alone changes nothing a visitor sees.

const audit = auditHooks({
  collection: "comment-reports",
  action: "comment-report",
  snapshot: (doc) => ({ status: doc.status }),
});

export const CommentReports: CollectionConfig = {
  slug: "comment-reports",
  labels: { singular: "Comment report", plural: "Comment reports" },
  admin: {
    group: "Discussion",
    useAsTitle: "reason",
    defaultColumns: ["comment", "reason", "note", "status", "createdAt"],
    description:
      "Sent by members from topic pages, open ones first. Open the comment to hide it, which marks its reports acted on, or dismiss a report that needs nothing done.",
  },
  // Statuses sort in the order they are listed: open first.
  defaultSort: ["status", "-createdAt"],
  access: {
    read: verifiedStaffOnly,
    create: nobody,
    update: verifiedStaffOnly,
    delete: nobody,
  },
  indexes: [
    { fields: ["comment", "reporter"], unique: true },
    { fields: ["status", "createdAt"] },
  ],
  hooks: {
    beforeChange: [
      ({ data, operation, originalDoc, req }) => {
        if (operation !== "update" || data.status === originalDoc?.status) {
          return data;
        }
        const open = data.status === "open";
        return {
          ...data,
          resolvedBy: open ? null : (req.user?.id ?? null),
          resolvedAt: open ? null : new Date().toISOString(),
        };
      },
    ],
    afterChange: audit.afterChange,
  },
  fields: [
    {
      name: "comment",
      type: "relationship",
      relationTo: "comments",
      required: true,
      access: readOnlyField,
      admin: { readOnly: true },
    },
    {
      // Optional so that deleting an account keeps its reports for review.
      name: "reporter",
      type: "relationship",
      relationTo: "users",
      index: true,
      access: readOnlyField,
      admin: { readOnly: true },
    },
    {
      name: "reason",
      type: "select",
      required: true,
      access: readOnlyField,
      admin: { readOnly: true },
      options: COMMENT_REPORT_REASONS.map((value) => ({
        value,
        label: COMMENT_REPORT_REASON_LABELS[value],
      })),
    },
    {
      name: "note",
      type: "textarea",
      maxLength: COMMENT_REPORT_NOTE_MAX_LENGTH,
      access: readOnlyField,
      admin: { readOnly: true },
    },
    {
      name: "status",
      type: "select",
      required: true,
      defaultValue: "open",
      options: COMMENT_REPORT_STATUSES.map((value) => ({
        value,
        label: COMMENT_REPORT_STATUS_LABELS[value],
      })),
      admin: { position: "sidebar" },
    },
    {
      name: "resolvedBy",
      type: "relationship",
      relationTo: "users",
      access: readOnlyField,
      admin: { position: "sidebar", readOnly: true },
    },
    {
      name: "resolvedAt",
      type: "date",
      access: readOnlyField,
      admin: {
        position: "sidebar",
        readOnly: true,
        date: { pickerAppearance: "dayAndTime" },
      },
    },
  ],
};
