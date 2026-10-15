import type { CollectionConfig } from "payload";

import { verifiedAdminsOnly, verifiedStaffOnly } from "@/access";
import { auditHooks } from "@/audit";

import { fillSlug, slugField } from "./slug";
import { keepWhileUsedByTopics } from "./topic-references";

// Free labels for topics (week 4); a topic can have many.
export const Tags: CollectionConfig = {
  slug: "tags",
  admin: {
    group: "Content",
    useAsTitle: "name",
    defaultColumns: ["name", "slug", "updatedAt"],
  },
  defaultSort: "name",
  access: {
    read: verifiedStaffOnly,
    create: verifiedAdminsOnly,
    update: verifiedAdminsOnly,
    delete: verifiedAdminsOnly,
  },
  fields: [
    { name: "name", type: "text", required: true, unique: true, maxLength: 60 },
    slugField,
  ],
  hooks: {
    beforeValidate: [fillSlug("tags")],
    beforeDelete: [keepWhileUsedByTopics("tags", "tag")],
    ...auditHooks({
      collection: "tags",
      action: "tag",
      snapshot: (doc) => ({ name: doc.name, slug: doc.slug }),
    }),
  },
};
