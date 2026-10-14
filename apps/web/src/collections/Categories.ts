import type { CollectionConfig } from "payload";

import { verifiedAdminsOnly, verifiedStaffOnly } from "@/access";
import { auditHooks } from "@/audit";

import { fillSlug, slugField } from "./slug";

// Broad subject areas for topics (week 4), such as health or elections. Tags
// are the finer labels.
export const Categories: CollectionConfig = {
  slug: "categories",
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
    { name: "name", type: "text", required: true, unique: true, maxLength: 80 },
    { name: "description", type: "textarea", maxLength: 500 },
    slugField,
  ],
  hooks: {
    beforeValidate: [fillSlug("categories")],
    ...auditHooks({
      collection: "categories",
      action: "category",
      snapshot: (doc) => ({
        name: doc.name,
        slug: doc.slug,
        description: doc.description ?? null,
      }),
    }),
  },
};
