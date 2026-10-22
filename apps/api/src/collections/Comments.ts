import {
  COMMENT_BODY_MAX_LENGTH,
  COMMENT_REPORT_REASON_LABELS,
  COMMENT_STATUS_LABELS,
  COMMENT_STATUSES,
  MODERATION_NOTE_MAX_LENGTH,
  MODERATION_REASONS,
} from "@countrytopics/domain";
import type { CollectionConfig } from "payload";

import { nobody, readOnlyField, verifiedStaffOnly } from "@/access";
import { afterModeration, moderateComment } from "@/comments/moderation-hooks";

// F6 comments on topics, in two levels: a comment with no parent starts a
// thread, and replies point to it (ADR 0009). Members write them through
// /api/v1 (src/comments), which checks who may post and where. In the admin
// panel, staff can only moderate them: hide or show a comment, lock a
// thread, and, for admins, remove a comment's text when the law requires
// it (ADR 0010).

export const Comments: CollectionConfig = {
  slug: "comments",
  admin: {
    group: "Discussion",
    useAsTitle: "body",
    defaultColumns: ["body", "topic", "author", "status", "createdAt"],
    description:
      "Written by members on topic pages. Staff hide comments that break the rules and lock threads; the text itself cannot be edited.",
  },
  defaultSort: "-createdAt",
  access: {
    read: verifiedStaffOnly,
    create: nobody,
    update: verifiedStaffOnly,
    delete: nobody,
  },
  // Threads are listed per topic by score or date, and replies per thread
  // by date, each ending with the id for paging.
  indexes: [
    { fields: ["topic", "parent", "createdAt"] },
    { fields: ["topic", "parent", "score", "createdAt"] },
    { fields: ["parent", "createdAt"] },
  ],
  hooks: {
    beforeChange: [moderateComment],
    afterChange: [afterModeration],
  },
  fields: [
    {
      name: "topic",
      type: "relationship",
      relationTo: "topics",
      required: true,
      access: readOnlyField,
      admin: { readOnly: true },
    },
    {
      name: "parent",
      label: "Reply to",
      type: "relationship",
      relationTo: "comments",
      access: readOnlyField,
      admin: {
        readOnly: true,
        description: "Empty for a comment that starts a thread.",
      },
    },
    {
      // Empty once the author deleted their account, which also erased
      // the text (ADR 0011).
      name: "author",
      type: "relationship",
      relationTo: "users",
      index: true,
      access: readOnlyField,
      admin: { readOnly: true },
    },
    {
      name: "body",
      label: "Comment",
      type: "textarea",
      required: true,
      access: readOnlyField,
      admin: { readOnly: true },
      // Empty only once removed (the moderation hook erases it) or deleted
      // with its author's account (src/account/deletion.ts).
      validate: (
        value: string | null | undefined,
        { siblingData }: { siblingData: Partial<{ status: unknown }> },
      ) => {
        if (siblingData.status === "removed") return true;
        if (siblingData.status === "deleted") return true;
        if (!value) return "A comment needs text.";
        return value.length <= COMMENT_BODY_MAX_LENGTH
          ? true
          : `Comments can be at most ${COMMENT_BODY_MAX_LENGTH} characters.`;
      },
    },
    {
      name: "score",
      type: "number",
      required: true,
      defaultValue: 0,
      access: readOnlyField,
      // Absent from moderation saves, which must not write it back over a
      // vote made meanwhile (src/comments/moderation-hooks.ts).
      validate: (value: number | null | undefined) =>
        value === undefined || Number.isInteger(value)
          ? true
          : "The score is a whole number.",
      admin: {
        readOnly: true,
        description: "Up votes minus down votes.",
      },
    },
    {
      name: "status",
      type: "select",
      required: true,
      defaultValue: "visible",
      options: COMMENT_STATUSES.map((value) => ({
        value,
        label: COMMENT_STATUS_LABELS[value],
      })),
      admin: {
        position: "sidebar",
        description:
          "Hidden comments leave the topic page; their author is told why. Only admins can remove one, which erases its text for good: use it only when the law requires it. Deleting an account erases its comments' text the same way.",
      },
    },
    {
      name: "moderationReason",
      label: "Reason",
      type: "select",
      options: MODERATION_REASONS.map((value) => ({
        value,
        label: COMMENT_REPORT_REASON_LABELS[value],
      })),
      admin: {
        position: "sidebar",
        description: "Shown to the author.",
        condition: (data) => data.status !== "visible",
      },
    },
    {
      name: "moderationNote",
      label: "Note for staff",
      type: "textarea",
      maxLength: MODERATION_NOTE_MAX_LENGTH,
      admin: {
        position: "sidebar",
        description: "Never shown to members.",
      },
    },
    {
      name: "locked",
      label: "Lock this thread",
      type: "checkbox",
      defaultValue: false,
      admin: {
        position: "sidebar",
        description:
          "No new replies or votes in the thread; it stays readable and reportable.",
        condition: (data) => !data.parent,
      },
    },
    {
      name: "moderatedBy",
      type: "relationship",
      relationTo: "users",
      access: readOnlyField,
      admin: { position: "sidebar", readOnly: true },
    },
    {
      name: "moderatedAt",
      type: "date",
      access: readOnlyField,
      admin: {
        position: "sidebar",
        readOnly: true,
        date: { pickerAppearance: "dayAndTime" },
      },
    },
    {
      name: "reports",
      type: "join",
      collection: "comment-reports",
      on: "comment",
      // Reports come only from members, on topic pages.
      admin: {
        allowCreate: false,
        defaultColumns: ["reason", "note", "status", "createdAt"],
      },
    },
  ],
};
