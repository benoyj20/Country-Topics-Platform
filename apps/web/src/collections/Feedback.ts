import {
  FEEDBACK_KINDS,
  FEEDBACK_MESSAGE_MAX_LENGTH,
  FEEDBACK_PAGE_MAX_LENGTH,
  FEEDBACK_STATUSES,
} from "@countrytopics/domain";
import type { CollectionConfig } from "payload";

import { nobody, readOnlyField, verifiedStaffOnly } from "@/access";
import { FEEDBACK_KIND_LABELS, FEEDBACK_STATUS_LABELS } from "@/content-labels";

// What members tell us about the site, sent from /feedback through
// POST /api/v1/feedback (ADR 0011). Staff read it here and mark it done;
// they cannot change what was sent. Deleting an account deletes its
// feedback (Users).

export const Feedback: CollectionConfig = {
  slug: "feedback",
  labels: { singular: "Feedback", plural: "Feedback" },
  admin: {
    group: "Administration",
    useAsTitle: "message",
    defaultColumns: ["message", "kind", "page", "status", "createdAt"],
    description:
      "Sent by members from the Feedback link at the bottom of every page, new first.",
  },
  // Statuses sort in the order they are listed: new first.
  defaultSort: ["status", "-createdAt"],
  access: {
    read: verifiedStaffOnly,
    create: nobody,
    update: verifiedStaffOnly,
    delete: nobody,
  },
  indexes: [{ fields: ["status", "createdAt"] }],
  fields: [
    {
      name: "author",
      type: "relationship",
      relationTo: "users",
      required: true,
      index: true,
      access: readOnlyField,
      admin: { readOnly: true },
    },
    {
      name: "kind",
      type: "select",
      required: true,
      access: readOnlyField,
      admin: { readOnly: true },
      options: FEEDBACK_KINDS.map((value) => ({
        value,
        label: FEEDBACK_KIND_LABELS[value],
      })),
    },
    {
      name: "message",
      type: "textarea",
      required: true,
      maxLength: FEEDBACK_MESSAGE_MAX_LENGTH,
      access: readOnlyField,
      admin: { readOnly: true },
    },
    {
      name: "page",
      type: "text",
      maxLength: FEEDBACK_PAGE_MAX_LENGTH,
      access: readOnlyField,
      admin: {
        readOnly: true,
        description: "The page it was sent from, if any.",
      },
    },
    {
      name: "status",
      type: "select",
      required: true,
      defaultValue: "new",
      options: FEEDBACK_STATUSES.map((value) => ({
        value,
        label: FEEDBACK_STATUS_LABELS[value],
      })),
      admin: { position: "sidebar" },
    },
  ],
};
