import type { CollectionConfig } from "payload";

import { nobody, verifiedAdminsOnly } from "@/access";

// One member's vote on one comment: 1 (up) or -1 (down); taking a vote
// back deletes it. The comment's score is kept in step in the same
// transaction (src/comments/store.ts). Hidden from the admin panel: votes
// are only counted.
export const CommentVotes: CollectionConfig = {
  slug: "comment-votes",
  admin: { group: "Discussion", hidden: true },
  access: {
    read: verifiedAdminsOnly,
    create: nobody,
    update: nobody,
    delete: nobody,
  },
  indexes: [{ fields: ["comment", "voter"], unique: true }],
  fields: [
    {
      name: "comment",
      type: "relationship",
      relationTo: "comments",
      required: true,
    },
    {
      // Optional so that deleting an account keeps the scores it counted in.
      name: "voter",
      type: "relationship",
      relationTo: "users",
      index: true,
    },
    { name: "value", type: "number", required: true, min: -1, max: 1 },
  ],
};
