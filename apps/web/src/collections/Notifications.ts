import { NOTIFICATION_KINDS } from "@countrytopics/domain";
import type { CollectionConfig } from "payload";

import { nobody, verifiedAdminsOnly } from "@/access";

// In-app notifications (ADR 0010): a reply in a thread the recipient
// started, or a moderator hiding their comment. Made by the comment routes
// and the moderation hooks; members read and mark them through
// /api/v1/account/notifications. What they show (the replier's name, the
// text, the topic) is read when they are listed, so a hidden reply or a
// changed name never lingers in one. Hidden from the admin panel.
export const Notifications: CollectionConfig = {
  slug: "notifications",
  admin: { group: "Discussion", hidden: true },
  access: {
    read: verifiedAdminsOnly,
    create: nobody,
    update: nobody,
    delete: nobody,
  },
  indexes: [
    { fields: ["recipient", "createdAt"] },
    { fields: ["recipient", "comment", "kind"], unique: true },
  ],
  fields: [
    {
      // Deleting an account deletes its notifications first (Users).
      name: "recipient",
      type: "relationship",
      relationTo: "users",
      required: true,
    },
    {
      name: "kind",
      type: "select",
      required: true,
      options: [...NOTIFICATION_KINDS],
    },
    {
      // The reply, or the comment that was hidden.
      name: "comment",
      type: "relationship",
      relationTo: "comments",
      required: true,
    },
    { name: "readAt", type: "date" },
  ],
};
