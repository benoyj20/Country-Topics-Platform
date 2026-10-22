import {
  CATEGORY_DESCRIPTION_MAX_LENGTH,
  CATEGORY_NAME_MAX_LENGTH,
} from "@countrytopics/domain";
import type { CollectionConfig } from "payload";

import { verifiedAdminsOnly, verifiedStaffOnly } from "@/access";
import { auditHooks } from "@/audit";
import { PUBLIC_TAGS, purgeOnChange } from "@/public-cache";
import { reindexTopicsOnChange } from "@/search-index";

import { fillSlug, slugField } from "./slug";
import { keepWhileUsedByTopics } from "./topic-references";

// Broad subject areas for topics (week 4), such as health or elections. Tags
// are the finer labels.
const audit = auditHooks({
  collection: "categories",
  action: "category",
  snapshot: (doc) => ({
    name: doc.name,
    slug: doc.slug,
    description: doc.description ?? null,
  }),
});

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
    {
      name: "name",
      type: "text",
      required: true,
      unique: true,
      maxLength: CATEGORY_NAME_MAX_LENGTH,
    },
    {
      name: "description",
      type: "textarea",
      maxLength: CATEGORY_DESCRIPTION_MAX_LENGTH,
    },
    slugField,
  ],
  hooks: purgeOnChange(PUBLIC_TAGS.categories, {
    beforeValidate: [fillSlug("categories")],
    beforeDelete: [keepWhileUsedByTopics("category", "category")],
    afterChange: [
      ...audit.afterChange,
      reindexTopicsOnChange("categories", {
        searched: (doc) => doc.name,
        topicsShowing: async (_req, id) => ({ category: { equals: id } }),
      }),
    ],
    afterDelete: audit.afterDelete,
  }),
};
