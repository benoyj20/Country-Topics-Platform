import { COMMENT_BODY_MAX_LENGTH } from "@countrytopics/domain";
import type { CollectionConfig } from "payload";

import { nobody, verifiedStaffOnly } from "@/access";

// F6 comments on topics, in two levels: a comment with no parent starts a
// thread, and replies point to it (ADR 0009). Members write them through
// /api/v1 (src/comments), which checks who may post and where; Payload's own
// API only lets staff read them. Hiding and locking come with moderation
// (MVP week 10).
export const Comments: CollectionConfig = {
  slug: "comments",
  admin: {
    group: "Discussion",
    useAsTitle: "body",
    defaultColumns: ["body", "topic", "author", "score", "createdAt"],
    description:
      "Written by members on topic pages. Read-only here; moderation tools come later.",
  },
  defaultSort: "-createdAt",
  access: {
    read: verifiedStaffOnly,
    create: nobody,
    update: nobody,
    delete: nobody,
  },
  // Threads are listed per topic by score or date, and replies per thread
  // by date, each ending with the id for paging.
  indexes: [
    { fields: ["topic", "parent", "createdAt"] },
    { fields: ["topic", "parent", "score", "createdAt"] },
    { fields: ["parent", "createdAt"] },
  ],
  fields: [
    {
      name: "topic",
      type: "relationship",
      relationTo: "topics",
      required: true,
    },
    {
      name: "parent",
      label: "Reply to",
      type: "relationship",
      relationTo: "comments",
      admin: { description: "Empty for a comment that starts a thread." },
    },
    {
      // Optional so that deleting an account keeps the discussion readable;
      // its comments then show no name.
      name: "author",
      type: "relationship",
      relationTo: "users",
      index: true,
    },
    {
      name: "body",
      label: "Comment",
      type: "textarea",
      required: true,
      maxLength: COMMENT_BODY_MAX_LENGTH,
    },
    {
      name: "score",
      type: "number",
      required: true,
      defaultValue: 0,
      admin: {
        readOnly: true,
        description: "Up votes minus down votes.",
      },
    },
  ],
};
